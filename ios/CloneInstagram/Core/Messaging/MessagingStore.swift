import Foundation
import Observation

enum PendingMessageState { case sending, failed }

/// Shared by all conversation screens; REST and socket results merge by server ID (ADR-023).
@Observable
final class MessagingStore {
    struct Pending: Identifiable {
        let id: String
        let conversationId: String
        let body: String
        var state: PendingMessageState
        /// Photo chosen by me, shown in the bubble until the message is confirmed (ADR-023).
        var photo: Data?
        /// Its uploaded `ready` media: a retry sends it again without a new upload.
        var mediaId: String?
    }

    private(set) var conversations: [Conversation] = []
    private(set) var messages: [String: [ChatMessage]] = [:]
    private(set) var pending: [Pending] = []
    private(set) var nextConversationCursor: String?
    private(set) var historyCursors: [String: String] = [:]
    private(set) var unavailableConversationIds: Set<String> = []
    /// Messages tab badge: unread conversations, from REST and adjusted by live events (ADR-023).
    private(set) var unreadConversationCount = 0
    /// The other member's read position per conversation (« Vu »).
    private(set) var otherReadPositions: [String: String] = [:]
    var errorMessage: String?
    /// The latest message I marked read per conversation; a failed read is retried at the next display.
    private var markedRead: [String: String] = [:]
    private var markingRead: Set<String> = []
    private var readRequested: Set<String> = []
    private var account: String?
    private var revision = 0
    private var syncAnchors: [String: String] = [:]
    private var opened: [String: Int] = [:]
    private var loadingHistory: Set<String> = []
    private var loadingConversations = false
    private var refreshRequested = false
    private var messageRevision = 0
    private var accessRevision = 0
    private let service: any MessagingService
    private let uploads: (any UploadService)?
    private var sending = OptimisticSync<String, Bool>()
    /// Signed URLs of message photos, shared by every conversation screen.
    let photos: MessagePhotoURLs

    init(service: any MessagingService, uploads: (any UploadService)? = nil) {
        self.service = service
        self.uploads = uploads
        photos = MessagePhotoURLs(service: service)
    }

    func setAccount(_ id: String?) {
        guard account != id else { return }
        revision += 1
        account = id
        conversations = []
        messages = [:]
        unavailableConversationIds = []
        refreshRequested = false
        messageRevision = 0
        accessRevision = 0
        pending = []
        opened = [:]
        syncAnchors = [:]
        historyCursors = [:]
        nextConversationCursor = nil
        loadingHistory = []
        loadingConversations = false
        sending = OptimisticSync()
        errorMessage = nil
        unreadConversationCount = 0
        otherReadPositions = [:]
        markedRead = [:]
        markingRead = []
        readRequested = []
        photos.reset()
    }

    func refresh(loadMore: Bool = false) async {
        guard !loadingConversations else { refreshRequested = true; return }
        guard !loadMore || nextConversationCursor != nil else { return }
        let started = revision
        let startedMessages = messageRevision
        let startedAccess = accessRevision
        loadingConversations = true
        defer { finishRefresh(started) }
        do {
            let page = try await service.conversations(cursor: loadMore ? nextConversationCursor : nil)
            guard started == revision, !Task.isCancelled else { return }
            guard startedAccess == accessRevision else { refreshRequested = true; return }
            if startedMessages != messageRevision {
                refreshRequested = true
            } else {
                unreadConversationCount = page.unreadConversationCount
                if !loadMore {
                    conversations = []
                }
            }
            for conversation in page.items {
                record(conversation)
            }
            nextConversationCursor = page.nextCursor
        } catch {
            guard started == revision, !Task.isCancelled else { return }
            errorMessage = "Impossible de charger les conversations. Réessayez."
        }
    }

    func open(userId: String) async -> Conversation? {
        let started = revision
        let startedAccess = accessRevision
        do {
            let conversation = try await service.open(userId: userId)
            guard started == revision, startedAccess == accessRevision, !Task.isCancelled else { return nil }
            unavailableConversationIds.remove(conversation.id)
            // Empty conversations are not inserted into the inbox.
            if conversation.lastMessage != nil {
                record(conversation)
            }
            return conversation
        } catch {
            if started == revision {
                errorMessage = "Impossible d'ouvrir cette conversation. Réessayez."
            }
            return nil
        }
    }

    func enter(_ id: String) async {
        opened[id, default: 0] += 1
        if messages[id] == nil {
            await loadHistory(id)
        } else {
            await catchUp(id)
        }
        await markLatestRead(id)
    }

    func leave(_ id: String) {
        let count = opened[id, default: 0] - 1
        opened[id] = count > 0 ? count : nil
    }

    func loadHistory(_ id: String, older: Bool = false) async {
        guard !loadingHistory.contains(id), !older || historyCursors[id] != nil else { return }
        let started = revision
        let startedAccess = accessRevision
        loadingHistory.insert(id)
        defer {
            if started == revision {
                loadingHistory.remove(id)
            }
        }
        do {
            let page = try await service.messages(conversationId: id, cursor: older ? historyCursors[id] : nil, after: nil)
            guard started == revision, startedAccess == accessRevision, !Task.isCancelled else { return }
            unavailableConversationIds.remove(id)
            if messages[id] == nil {
                messages[id] = []
            }
            page.items.forEach(receive)
            if !older {
                syncAnchors[id] = page.items.first?.id
            }
            historyCursors[id] = page.nextCursor
        } catch {
            guard started == revision, startedAccess == accessRevision, !Task.isCancelled else { return }
            handle(error, conversationId: id)
        }
    }

    func reconnect() async {
        for id in Array(opened.keys) {
            guard !Task.isCancelled else { return }
            await catchUp(id)
        }
        await refresh()
    }

    private func catchUp(_ id: String) async {
        guard let anchor = syncAnchors[id] else { await loadHistory(id); return }
        let started = revision
        let startedAccess = accessRevision
        var cursor: String?
        do {
            repeat {
                let page = try await service.messages(conversationId: id, cursor: cursor, after: anchor)
                guard started == revision, startedAccess == accessRevision, !Task.isCancelled else { return }
                page.items.forEach(receive)
                if let last = page.items.last {
                    syncAnchors[id] = last.id
                }
                cursor = page.nextCursor
            } while cursor != nil
        } catch {
            guard started == revision, startedAccess == accessRevision, !Task.isCancelled else { return }
            handle(error, conversationId: id)
        }
    }

    func receive(_ message: ChatMessage) {
        guard !unavailableConversationIds.contains(message.conversationId) else { return }
        messageRevision += 1
        var items = messages[message.conversationId, default: []]
        if !items.contains(where: { $0.id == message.id }) {
            items.append(message)
        }
        items.sort { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        messages[message.conversationId] = items
        pending.removeAll { $0.id == message.clientId && message.senderId == account }
        if let index = conversations.firstIndex(where: { $0.id == message.conversationId }) {
            let previous = conversations[index].lastMessage
            let isNewer = previous
                .map { $0.createdAt < message.createdAt || ($0.createdAt == message.createdAt && $0.id < message.id) } ?? true
            if isNewer {
                conversations[index].lastMessage = message
                sortConversations()
            }
        }
    }

    func send(conversationId: String, body: String) async {
        guard !body.isEmpty, body.unicodeScalars.count <= 1000 else { return }
        let id = UUID().uuidString.lowercased()
        pending.append(Pending(id: id, conversationId: conversationId, body: body, state: .sending))
        await retry(clientId: id)
    }

    func retry(clientId: String) async {
        guard let item = pending.first(where: { $0.id == clientId }) else { return }
        let started = revision
        if let index = pending.firstIndex(where: { $0.id == clientId }) {
            pending[index].state = .sending
        }
        let send: (Bool) async throws -> Bool = { _ in
            let message = if let photo = item.photo {
                try await self.sendPhoto(photo, clientId: clientId, conversationId: item.conversationId, started: started)
            } else {
                try await self.service.send(conversationId: item.conversationId, clientId: clientId, body: item.body)
            }
            if started == self.revision {
                self.receive(message)
            }
            return true
        }
        let outcome = await sending.sync(clientId, to: true, confirmed: false, intentOf: { $0 }, send: send)
        guard started == revision else { return }
        if case let .failed(error, _, _) = outcome {
            if case MessagingError.notFound = error {
                handle(error, conversationId: item.conversationId)
            } else if let index = pending.firstIndex(where: { $0.id == clientId }) {
                pending[index].state = .failed
                errorMessage = switch error {
                case let upload as UploadError: UploadError.message(for: upload)
                case MessagingError.photoRejected: "La photo n'a pas pu être envoyée. Appuyez sur Réessayer pour la renvoyer."
                default: "Message non envoyé. Appuyez sur Réessayer pour le renvoyer."
                }
            }
        }
        if case .confirmed = outcome {
            await refresh()
        }
    }

    /// A photo: optimistic bubble at once, then upload (waiting for `media.ready`) and message (ADR-023).
    func sendPhoto(conversationId: String, data: Data) async {
        let id = UUID().uuidString.lowercased()
        pending.append(Pending(id: id, conversationId: conversationId, body: "", state: .sending, photo: data))
        await retry(clientId: id)
    }

    /// Uploads the photo once, then sends its media with the same `clientId` on every retry.
    private func sendPhoto(_ photo: Data, clientId: String, conversationId: String, started: Int) async throws -> ChatMessage {
        guard let uploads else { throw MessagingError.unavailable }
        var mediaId = pending.first { $0.id == clientId }?.mediaId
        if mediaId == nil {
            let uploaded = try await uploads.uploadImage(photo, purpose: .message)
            guard started == revision else { throw CancellationError() }
            if let index = pending.firstIndex(where: { $0.id == clientId }) {
                pending[index].mediaId = uploaded
            }
            mediaId = uploaded
        }
        guard let mediaId else { throw MessagingError.unavailable }
        do {
            return try await service.sendPhoto(conversationId: conversationId, clientId: clientId, mediaId: mediaId)
        } catch MessagingError.photoRejected {
            // Not attachable any more: the next retry uploads the photo again.
            if started == revision, let index = pending.firstIndex(where: { $0.id == clientId }) {
                pending[index].mediaId = nil
            }
            throw MessagingError.photoRejected
        }
    }

    private func handle(_ error: Error, conversationId: String) {
        if case MessagingError.notFound = error {
            accessRevision += 1
            unavailableConversationIds.insert(conversationId)
            pending.removeAll { $0.conversationId == conversationId }
            messages[conversationId] = nil
            syncAnchors[conversationId] = nil
            otherReadPositions[conversationId] = nil
            markedRead[conversationId] = nil
            if conversations.contains(where: { $0.id == conversationId && $0.unreadCount > 0 }) {
                unreadConversationCount = max(0, unreadConversationCount - 1)
            }
            conversations.removeAll { $0.id == conversationId }
        }
        errorMessage = "Conversation indisponible. Vérifiez votre connexion et réessayez."
    }
}

private extension MessagingStore {
    func finishRefresh(_ started: Int) {
        guard started == revision else { return }
        loadingConversations = false
        guard refreshRequested else { return }
        refreshRequested = false
        Task {
            if started == self.revision {
                await self.refresh()
            }
        }
    }

    func finishRead(_ id: String, started: Int) {
        guard started == revision else { return }
        markingRead.remove(id)
        if readRequested.remove(id) != nil {
            Task { await markLatestRead(id) }
        }
    }

    func advanceOtherRead(_ id: String, to position: String) {
        let items = messages[id, default: []]
        let currentIndex = otherReadPositions[id].flatMap { current in items.firstIndex { $0.id == current } }
        let newIndex = items.firstIndex { $0.id == position }
        if let currentIndex, let newIndex, newIndex <= currentIndex {
            return
        }
        otherReadPositions[id] = position
        if let index = conversations.firstIndex(where: { $0.id == id }) {
            conversations[index].otherMemberLastReadMessageId = position
        }
    }

    func record(_ value: Conversation) {
        unavailableConversationIds.remove(value.id)
        var conversation = value
        if let current = conversations.first(where: { $0.id == value.id }), let previous = current.lastMessage {
            let returned = value.lastMessage
            let keepPrevious = returned
                .map { $0.createdAt < previous.createdAt || ($0.createdAt == previous.createdAt && $0.id < previous.id) } ?? true
            if keepPrevious {
                conversation.lastMessage = previous
            }
        }
        conversations.removeAll { $0.id == conversation.id }
        conversations.append(conversation)
        sortConversations()
        if let position = value.otherMemberLastReadMessageId {
            advanceOtherRead(value.id, to: position)
        }
    }

    func sortConversations() {
        conversations.sort {
            let first = $0.lastMessage?.createdAt ?? $0.createdAt
            let second = $1.lastMessage?.createdAt ?? $1.createdAt
            return first == second ? $0.id > $1.id : first > second
        }
    }
}

// MARK: - Read positions, unread counts and « Vu » (ADR-023)

extension MessagingStore {
    /// A `message.created` event: counted as unread, or read at once if the conversation is on screen.
    func receiveLive(_ message: ChatMessage) {
        let id = message.conversationId
        let isKnown = messages[id]?.contains { $0.id == message.id } ?? false
        let isUnavailable = unavailableConversationIds.contains(id)
        receive(message)
        guard !isKnown, !isUnavailable, message.senderId != account else { return }
        if opened[id] != nil {
            Task { await markLatestRead(id) }
        } else if let index = conversations.firstIndex(where: { $0.id == id }) {
            if conversations[index].unreadCount == 0 {
                unreadConversationCount += 1
            }
            conversations[index].unreadCount += 1
        }
    }

    /// A `conversation.read` event from the other member moves « Vu » forward, never back.
    func readPositionChanged(conversationId: String, userId: String, lastReadMessageId: String) {
        guard userId != account else { return }
        advanceOtherRead(conversationId, to: lastReadMessageId)
    }

    /// My latest message, if the other member has read up to it.
    func seenMessageId(in conversationId: String) -> String? {
        guard let account, let items = messages[conversationId], let position = otherReadPositions[conversationId],
              let mine = items.lastIndex(where: { $0.senderId == account }),
              let read = items.firstIndex(where: { $0.id == position }), read >= mine
        else { return nil }
        return items[mine].id
    }

    /// Marks the latest displayed message read when the other member wrote something since my last read.
    func markLatestRead(_ id: String) async {
        guard opened[id] != nil, let account, let items = messages[id], let latest = items.last,
              latest.id != markedRead[id] else { return }
        let start = markedRead[id].flatMap { marked in items.firstIndex { $0.id == marked } }.map { $0 + 1 } ?? 0
        guard items[start...].contains(where: { $0.senderId != account }) else { return }
        guard !markingRead.contains(id) else { readRequested.insert(id); return }
        markingRead.insert(id)
        let started = revision
        defer { finishRead(id, started: started) }
        do {
            try await service.markRead(conversationId: id, messageId: latest.id)
            guard started == revision else { return }
            markedRead[id] = latest.id
            if let index = conversations.firstIndex(where: { $0.id == id }) {
                if conversations[index].unreadCount > 0 {
                    unreadConversationCount = max(0, unreadConversationCount - 1)
                }
                conversations[index].unreadCount = 0
            } else {
                await refresh()
            }
        } catch {
            guard started == revision, !Task.isCancelled else { return }
            // Other failures stay silent: reading is not blocking and is retried at the next display.
            if case MessagingError.notFound = error {
                handle(error, conversationId: id)
            }
        }
    }
}
