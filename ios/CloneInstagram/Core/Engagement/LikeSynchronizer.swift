import Foundation
import Observation

/// Issue d'un like ou d'un unlike, pour l'écran qui l'a demandé.
enum LikeOutcome: Equatable {
    /// L'API a confirmé l'état (compteur à jour, likes des autres compris).
    case confirmed
    /// Échec : retour au dernier état confirmé, message à afficher.
    case reverted(message: String)
    /// Post supprimé ou devenu invisible (`404`) : il disparaît de l'écran.
    case postGone
}

/**
 Likes des posts, partagés par tous les écrans (une instance pour l'app, comme Instagram) : un like donné
 dans le détail se voit aussi dans le feed. Chaque écran affiche ses posts à travers `displayed(_:)`.

 Mise à jour optimiste (ADR-010) : l'état change tout de suite, puis prend celui confirmé par l'API, ou y
 revient en cas d'échec. Jamais deux appels en parallèle pour un même post : un tap pendant un appel ne
 change que l'état voulu, renvoyé à la fin de l'appel s'il diffère de celui que l'API a confirmé.
 */
@Observable
final class LikeSynchronizer {
    /// Dernier état connu des posts vus pendant la session : lu dans une réponse de l'API, ou optimiste.
    private var statuses: [String: LikeStatus] = [:]
    /// État voulu, par post, pendant qu'un appel est en cours.
    @ObservationIgnored private var desired: [String: Bool] = [:]
    @ObservationIgnored private let service: any EngagementService

    init(service: any EngagementService) {
        self.service = service
    }

    /// Le post avec son dernier état de like connu, quel que soit l'écran qui l'a changé.
    func displayed(_ post: Post) -> Post {
        guard let status = statuses[post.id] else { return post }
        var post = post
        post.apply(status)
        return post
    }

    /// Posts reçus de l'API : leur état devient le dernier connu, sauf pendant un like en cours.
    func record(_ posts: [Post]) {
        for post in posts where desired[post.id] == nil {
            statuses[post.id] = post.likeStatus
        }
    }

    /// Bouton J'aime : like ou unlike.
    func toggleLike(_ post: Post) async -> LikeOutcome? {
        await setLiked(!displayed(post).isLiked, post: post)
    }

    /// Double tap sur la photo : like seulement, jamais d'unlike (comme Instagram).
    func likeFromDoubleTap(_ post: Post) async -> LikeOutcome? {
        await setLiked(true, post: post)
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        statuses = [:]
        desired = [:]
    }

    /**
     `nil` si rien n'a été envoyé : état déjà voulu, ou appel déjà en cours (c'est lui qui enverra le nouvel
     état et rendra l'issue à l'écran qui l'a lancé).
     */
    private func setLiked(_ isLiked: Bool, post: Post) async -> LikeOutcome? {
        let shown = displayed(post)
        guard shown.isLiked != isLiked else { return nil }
        var optimistic = shown
        optimistic.setLiked(isLiked)
        statuses[post.id] = optimistic.likeStatus

        let isSyncing = desired[post.id] != nil
        desired[post.id] = isLiked
        guard !isSyncing else { return nil }
        defer { desired[post.id] = nil }

        var current = shown.likeStatus
        while let wanted = desired[post.id], wanted != current.isLiked {
            do {
                current = try await wanted ? service.like(postId: post.id) : service.unlike(postId: post.id)
            } catch .postNotFound {
                statuses[post.id] = nil
                return .postGone
            } catch {
                statuses[post.id] = current
                return .reverted(message: Self.message(for: error, liking: wanted))
            }
        }
        statuses[post.id] = current
        return .confirmed
    }

    /// Message compréhensible, sans détail technique (ADR-014).
    static func message(for error: EngagementServiceError, liking: Bool) -> String {
        switch error {
        case .rateLimited:
            "Vous avez effectué beaucoup d'actions en peu de temps. Réessayez dans un instant."
        case .unauthenticated:
            "Votre session a expiré. Reconnectez-vous."
        case .unreachable:
            "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .postNotFound, .profileNotFound, .invalidInput, .unexpectedResponse:
            liking ? "Impossible d'aimer cette publication. Réessayez." : "Impossible de retirer votre mention J'aime. Réessayez."
        }
    }
}

extension Post {
    /// État du like, tel que l'API le décrit.
    var likeStatus: LikeStatus {
        LikeStatus(isLiked: isLiked, likeCount: likeCount)
    }

    /// Changement optimiste : le compteur suit le cœur.
    mutating func setLiked(_ liked: Bool) {
        guard isLiked != liked else { return }
        isLiked = liked
        likeCount = max(0, likeCount + (liked ? 1 : -1))
    }

    mutating func apply(_ status: LikeStatus) {
        isLiked = status.isLiked
        likeCount = status.likeCount
    }
}
