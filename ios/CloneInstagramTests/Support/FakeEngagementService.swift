import Foundation
@testable import CloneInstagram

/// Faux `EngagementService` : réponses programmables, appels enregistrés.
final class FakeEngagementService: EngagementService {
    struct Call: Equatable {
        let isLiking: Bool
        let postId: String
    }

    /// Réponses successives de `like` / `unlike` ; quand la liste est vide : l'état demandé, 1 ou 0 like.
    var results: [Result<LikeStatus, EngagementServiceError>] = []
    /// Appelé pendant un appel, avant la réponse (ex. l'utilisateur touche encore le cœur).
    var duringCall: (() async -> Void)?

    private(set) var calls: [Call] = []

    func like(postId: String) async throws(EngagementServiceError) -> LikeStatus {
        try await reply(Call(isLiking: true, postId: postId))
    }

    func unlike(postId: String) async throws(EngagementServiceError) -> LikeStatus {
        try await reply(Call(isLiking: false, postId: postId))
    }

    private func reply(_ call: Call) async throws(EngagementServiceError) -> LikeStatus {
        calls.append(call)
        if let duringCall {
            self.duringCall = nil
            await duringCall()
        }
        guard !results.isEmpty else { return LikeStatus(isLiked: call.isLiking, likeCount: call.isLiking ? 1 : 0) }
        return try results.removeFirst().get()
    }
}
