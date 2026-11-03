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

    private func message(_ id: String) -> ChatMessage {
        ChatMessage(
            id: id,
            conversationId: "conversation",
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
}
