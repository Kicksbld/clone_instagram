import Foundation
import Testing
@testable import CloneInstagram

@MainActor
struct MessagingStoreTests {
    @Test func retryKeepsClientIDAndRealtimeDeduplicatesREST() async throws {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.send(conversationId: "conversation", body: "Bonjour")
        let pending = try #require(store.pending.first)
        #expect(pending.state == .failed)
        service.shouldFail = false
        await store.retry(clientId: pending.id)
        #expect(service.sentIDs == [pending.id, pending.id])
        #expect(store.pending.isEmpty)
        let message = try #require(store.messages["conversation"]?.first)
        store.receive(message)
        #expect(store.messages["conversation"]?.count == 1)
    }

    @Test func reconnectPagesFromRESTAnchorEvenAfterNewerSocketMessage() async {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        service.pages = [MessagePage(items: [message("1")], nextCursor: nil)]
        await store.enter("conversation")
        store.receive(message("4"))
        service.pages = [
            MessagePage(items: [message("2"), message("3")], nextCursor: "page2"),
            MessagePage(items: [message("4")], nextCursor: nil),
        ]
        await store.reconnect()
        #expect(service.afters == [nil, "1", "1"])
        #expect(service.cursors == [nil, nil, "page2"])
        #expect(store.messages["conversation"]?.map(\.id) == ["1", "2", "3", "4"])
        store.leave("conversation")
        store.setAccount("other")
        #expect(store.messages.isEmpty)
        #expect(store.conversations.isEmpty)
    }

    @Test func optimisticSendIsImmediateAndLateResponseCannotEnterAnotherSession() async {
        let service = FakeMessagingService()
        service.shouldFail = false
        service.holdSend = true
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let task = Task { await store.send(conversationId: "conversation", body: "En attente") }
        while service.continuation == nil {
            await Task.yield()
        }
        #expect(store.pending.first?.state == .sending)
        #expect(store.pending.first?.body == "En attente")
        store.setAccount("other")
        service.continuation?.resume()
        await task.value
        #expect(store.messages.isEmpty)
        #expect(store.pending.isEmpty)
    }

    @Test func sendNotFoundRemovesHistoryAndPendingMessage() async {
        let service = FakeMessagingService()
        service.sendNotFound = true
        let store = MessagingStore(service: service)
        store.setAccount("me")
        store.receive(message("1"))
        await store.send(conversationId: "conversation", body: "Bonjour")
        #expect(store.messages["conversation"] == nil)
        #expect(store.pending.isEmpty)
        #expect(store.unavailableConversationIds.contains("conversation"))
        #expect(store.errorMessage != nil)
        service.pages = [MessagePage(items: [message("1")], nextCursor: nil)]
        await store.loadHistory("conversation")
        #expect(!store.unavailableConversationIds.contains("conversation"))
        #expect(store.messages["conversation"]?.count == 1)
    }

    @Test func delayedInboxCannotOverwriteNewerEventAndQueuesRefresh() async {
        let service = FakeMessagingService()
        let old = Conversation(
            id: "conversation",
            otherMember: PostAuthor(id: "other", username: "other", avatar: nil),
            createdAt: Date(timeIntervalSince1970: 0),
            lastMessage: message("1")
        )
        service.inbox = ConversationPage(items: [old], nextCursor: nil)
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.refresh()
        service.holdInbox = true
        let task = Task { await store.refresh() }
        while service.inboxContinuation == nil {
            await Task.yield()
        }
        store.receive(message("2"))
        await store.refresh()
        var latest = old
        latest.lastMessage = message("2")
        service.inbox = ConversationPage(items: [latest], nextCursor: nil)
        service.inboxContinuation?.resume()
        await task.value
        #expect(store.conversations.first?.lastMessage?.id == "2")
        while service.inboxCalls < 3 {
            await Task.yield()
        }
        #expect(service.inboxCalls == 3)
    }

    @Test func historyStartedBeforeNotFoundCannotRestoreInvisibleMessages() async {
        let service = FakeMessagingService()
        service.sendNotFound = true
        service.holdHistory = true
        service.pages = [MessagePage(items: [message("1")], nextCursor: nil)]
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let task = Task { await store.loadHistory("conversation") }
        while service.historyContinuation == nil {
            await Task.yield()
        }
        await store.send(conversationId: "conversation", body: "Bonjour")
        service.historyContinuation?.resume()
        await task.value
        #expect(store.messages["conversation"] == nil)
        #expect(store.unavailableConversationIds.contains("conversation"))
    }

    @Test func badgeComesFromRESTAndLiveMessagesRaiseItOncePerConversation() async {
        let service = FakeMessagingService()
        service.inbox = ConversationPage(
            items: [conversation("read", unread: 0), conversation("unread", unread: 2)],
            nextCursor: nil,
            unreadConversationCount: 1
        )
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.refresh()
        #expect(store.unreadConversationCount == 1)
        store.receiveLive(message("5", in: "read"))
        store.receiveLive(message("6", in: "read"))
        store.receiveLive(message("6", in: "read"))
        #expect(store.unreadConversationCount == 2)
        #expect(store.conversations.first { $0.id == "read" }?.unreadCount == 2)
        store.receiveLive(ChatMessage(id: "7", conversationId: "unread", senderId: "me", clientId: "7", body: "", createdAt: .now))
        #expect(store.unreadConversationCount == 2)
    }

    @Test func enteringMarksTheLatestMessageReadOnceAndClearsTheBadge() async {
        let service = FakeMessagingService()
        service.inbox = ConversationPage(items: [conversation("conversation", unread: 1)], nextCursor: nil, unreadConversationCount: 1)
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.refresh()
        service.pages = [MessagePage(items: [message("2"), message("1")], nextCursor: nil)]
        await store.enter("conversation")
        #expect(service.reads == ["2"])
        #expect(store.unreadConversationCount == 0)
        #expect(store.conversations.first?.unreadCount == 0)
        store.leave("conversation")
        await store.enter("conversation")
        #expect(service.reads == ["2"])
    }

    @Test func liveMessageInOpenConversationIsReadInsteadOfCounted() async {
        let service = FakeMessagingService()
        service.inbox = ConversationPage(items: [conversation("conversation", unread: 0)], nextCursor: nil, unreadConversationCount: 0)
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.refresh()
        service.pages = [MessagePage(items: [message("1")], nextCursor: nil)]
        await store.enter("conversation")
        store.receiveLive(message("3"))
        while service.reads.count < 2 {
            await Task.yield()
        }
        #expect(service.reads == ["1", "3"])
        #expect(store.unreadConversationCount == 0)
    }

    @Test func failedReadIsRetriedOnTheNextDisplay() async {
        let service = FakeMessagingService()
        service.readFails = true
        let store = MessagingStore(service: service)
        store.setAccount("me")
        service.pages = [MessagePage(items: [message("1")], nextCursor: nil)]
        await store.enter("conversation")
        #expect(store.errorMessage == nil)
        store.leave("conversation")
        service.readFails = false
        await store.enter("conversation")
        #expect(service.reads == ["1", "1"])
    }

    @Test func seenShowsUnderMyLatestMessageOnceTheOtherHasReadIt() {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        store.receive(mine("1"))
        store.receive(mine("2"))
        #expect(store.seenMessageId(in: "conversation") == nil)
        store.readPositionChanged(conversationId: "conversation", userId: "other", lastReadMessageId: "1")
        #expect(store.seenMessageId(in: "conversation") == nil)
        store.readPositionChanged(conversationId: "conversation", userId: "other", lastReadMessageId: "2")
        #expect(store.seenMessageId(in: "conversation") == "2")
        // An older event arriving late never moves « Vu » back.
        store.readPositionChanged(conversationId: "conversation", userId: "other", lastReadMessageId: "1")
        #expect(store.seenMessageId(in: "conversation") == "2")
        store.receive(mine("3"))
        #expect(store.seenMessageId(in: "conversation") == nil)
    }

    @Test func inboxRestoresSeenPositionAfterReconnect() async {
        let service = FakeMessagingService()
        var value = conversation("conversation", unread: 0)
        value.otherMemberLastReadMessageId = "1"
        service.inbox = ConversationPage(items: [value], nextCursor: nil, unreadConversationCount: 0)
        let store = MessagingStore(service: service)
        store.setAccount("me")
        store.receive(mine("1"))
        await store.reconnect()
        #expect(store.seenMessageId(in: "conversation") == "1")
    }

    private func conversation(_ id: String, unread: Int) -> Conversation {
        Conversation(
            id: id,
            otherMember: PostAuthor(id: "other", username: "other", avatar: nil),
            createdAt: Date(timeIntervalSince1970: 0),
            lastMessage: message("1", in: id),
            unreadCount: unread
        )
    }

    private func mine(_ id: String) -> ChatMessage {
        ChatMessage(
            id: id,
            conversationId: "conversation",
            senderId: "me",
            clientId: id,
            body: id,
            createdAt: Date(timeIntervalSince1970: Double(id) ?? 0)
        )
    }

    private func message(_ id: String, in conversationId: String = "conversation") -> ChatMessage {
        ChatMessage(
            id: id,
            conversationId: conversationId,
            senderId: "other",
            clientId: id,
            body: id,
            createdAt: Date(timeIntervalSince1970: Double(id) ?? 0)
        )
    }
}

@MainActor
final class FakeMessagingService: MessagingService {
    var shouldFail = true
    var sendNotFound = false
    var inbox = ConversationPage(items: [], nextCursor: nil)
    var holdInbox = false
    var inboxCalls = 0
    var inboxContinuation: CheckedContinuation<Void, Never>?
    var sentIDs: [String] = []
    var pages: [MessagePage] = []
    var afters: [String?] = []
    var cursors: [String?] = []
    var holdHistory = false
    var historyContinuation: CheckedContinuation<Void, Never>?
    var holdSend = false
    var continuation: CheckedContinuation<Void, Never>?
    var reads: [String] = []
    var readFails = false
    func conversations(cursor _: String?) async throws -> ConversationPage {
        inboxCalls += 1
        let snapshot = inbox
        if holdInbox {
            holdInbox = false
            await withCheckedContinuation { inboxContinuation = $0 }
        }
        return snapshot
    }

    func open(userId _: String) async throws -> Conversation {
        throw MessagingError.unavailable
    }

    func messages(conversationId _: String, cursor: String?, after: String?) async throws -> MessagePage {
        afters.append(after)
        cursors.append(cursor)
        let page = pages.isEmpty ? MessagePage(items: [], nextCursor: nil) : pages.removeFirst()
        if holdHistory {
            await withCheckedContinuation { historyContinuation = $0 }
        }
        return page
    }

    func send(conversationId: String, clientId: String, body: String) async throws -> ChatMessage {
        sentIDs.append(clientId)
        if holdSend {
            await withCheckedContinuation { continuation = $0 }
        }
        if sendNotFound {
            throw MessagingError.notFound
        }
        if shouldFail {
            throw MessagingError.unavailable
        }
        return ChatMessage(id: "server", conversationId: conversationId, senderId: "me", clientId: clientId, body: body, createdAt: Date())
    }

    func markRead(conversationId _: String, messageId: String) async throws {
        reads.append(messageId)
        if readFails {
            throw MessagingError.requestFailed
        }
    }
}
