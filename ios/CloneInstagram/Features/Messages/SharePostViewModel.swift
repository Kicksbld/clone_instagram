import Foundation
import Observation

@Observable
final class SharePostViewModel {
    enum State { case sending, failed, sent }
    struct Attempt {
        let clientId: String
        var conversationId: String?
        var state: State
    }

    let discovery: MessagesViewModel
    private(set) var selected: [PostAuthor] = []
    private(set) var attempts: [String: Attempt] = [:]
    private let viewerId: String
    private let postId: String

    init(postId: String, store: MessagingStore, social: any SocialService, viewerId: String) {
        self.viewerId = viewerId
        self.postId = postId
        discovery = MessagesViewModel(store: store, social: social, viewerId: viewerId)
    }

    func toggle(_ user: PostAuthor) {
        guard attempts[user.id] == nil else { return }
        if selected.contains(where: { $0.id == user.id }) {
            selected.removeAll { $0.id == user.id }
        } else {
            selected.append(user)
        }
    }

    func send() async {
        let recipients = selected.filter { attempts[$0.id] == nil }
        for user in recipients {
            attempts[user.id] = Attempt(clientId: UUID().uuidString.lowercased(), state: .sending)
        }
        for user in recipients {
            guard !Task.isCancelled else { return }
            await deliver(userId: user.id)
        }
    }

    func retry(userId: String) async {
        guard attempts[userId]?.state == .failed else { return }
        attempts[userId]?.state = .sending
        await deliver(userId: userId)
    }

    private func deliver(userId: String) async {
        guard let attempt = attempts[userId], discovery.store.isActive(viewerId: viewerId), !Task.isCancelled else { return }
        let store = discovery.store
        let conversationId: String
        if let existing = attempt.conversationId, !store.unavailableConversationIds.contains(existing) {
            conversationId = existing
        } else if let conversation = await store.open(userId: userId) {
            conversationId = conversation.id
            attempts[userId]?.conversationId = conversation.id
        } else {
            attempts[userId]?.state = .failed
            AccessibilityFeedback.announce("Partage non envoyé. Vous pouvez réessayer.")
            return
        }
        guard store.isActive(viewerId: viewerId), !Task.isCancelled else { return }
        await store.share(conversationId: conversationId, postId: postId, clientId: attempt.clientId)
        let confirmed = store.messages[conversationId, default: []].contains { $0.clientId == attempt.clientId }
        attempts[userId]?.state = confirmed ? .sent : .failed
        AccessibilityFeedback.announce(confirmed ? "Publication partagée" : "Partage non envoyé. Vous pouvez réessayer.")
    }
}
