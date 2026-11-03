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
    }

    private(set) var conversations: [Conversation] = []
    private(set) var messages: [String: [ChatMessage]] = [:]
    private(set) var pending: [Pending] = []
    private(set) var nextConversationCursor: String?
    private(set) var historyCursors: [String: String] = [:]
    private(set) var unavailableConversationIds: Set<String> = []
    var errorMessage: String?
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
    private var sending = OptimisticSync<String, Bool>()

    init(service: any MessagingService) {
        self.service = service
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
            } else if !loadMore {
                conversations = []
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
            let message = try await self.service.send(conversationId: item.conversationId, clientId: clientId, body: item.body)
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
                errorMessage = "Message non envoyé. Appuyez sur Réessayer pour le renvoyer."
            }
        }
        if case .confirmed = outcome {
            await refresh()
        }
    }

    private func handle(_ error: Error, conversationId: String) {
        if case MessagingError.notFound = error {
            accessRevision += 1
            unavailableConversationIds.insert(conversationId)
            pending.removeAll { $0.conversationId == conversationId }
            messages[conversationId] = nil
            syncAnchors[conversationId] = nil
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
    }

    func sortConversations() {
        conversations.sort {
            let first = $0.lastMessage?.createdAt ?? $0.createdAt
            let second = $1.lastMessage?.createdAt ?? $1.createdAt
            return first == second ? $0.id > $1.id : first > second
        }
    }
}
