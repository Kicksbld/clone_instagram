import Foundation
import Observation

/// Abonnement à un compte, tel que l'app le connaît ; `followerCount` est `nil` tant qu'aucun profil ne l'a donné.
struct FollowState: Equatable {
    var isFollowing: Bool
    var followerCount: Int?

    /// Changement optimiste : le nombre d'abonnés, s'il est connu, suit le bouton.
    mutating func setFollowing(_ following: Bool) {
        guard isFollowing != following else { return }
        isFollowing = following
        followerCount = followerCount.map { max(0, $0 + (following ? 1 : -1)) }
    }
}

/// Issue d'un follow ou d'un unfollow, pour l'écran qui l'a demandé.
enum FollowOutcome: Equatable {
    /// L'API a confirmé l'état (nombre d'abonnés à jour).
    case confirmed
    /// Échec : retour au dernier état confirmé, message à afficher.
    case reverted(message: String)
    /// Compte inexistant ou devenu invisible (`404`) : il disparaît de l'écran.
    case userGone
}

/**
 Abonnements, partagés par tous les écrans (une instance pour l'app, comme les likes) : un compte suivi depuis
 une liste l'est aussi sur son profil, dans la recherche et dans mon compteur « suivi(e)s ». Chaque écran
 affiche ses comptes à travers `displayed(_:)`.

 Mise à jour optimiste sur le moteur commun `OptimisticSync` (ADR-020) : le bouton change tout de suite, puis
 prend l'état confirmé par l'API, ou y revient en cas d'échec ; un tap pendant un appel ne change que l'état
 voulu (le dernier choix gagne).
 */
@Observable
final class FollowStore {
    /// Dernier état connu des comptes vus pendant la session : lu dans une réponse de l'API, ou optimiste.
    private var states: [String: FollowState] = [:]
    /// Abonnement de chaque compte changé depuis le dernier chargement de mon profil, avant ce changement :
    /// mon compteur « suivi(e)s » en tient compte jusqu'au prochain chargement.
    private var baselines: [String: Bool] = [:]
    /// Abonnement voulu par compte, un seul appel en cours par compte.
    @ObservationIgnored private let sync = OptimisticSync<String, Bool>()
    @ObservationIgnored private let service: any SocialService
    @ObservationIgnored private let analytics: any AnalyticsService

    init(service: any SocialService, analytics: any AnalyticsService = NoopAnalyticsService()) {
        self.service = service
        self.analytics = analytics
    }

    /// Écart de mon compteur « suivi(e)s » avec mon profil chargé, follows optimistes compris.
    var followingCountDelta: Int {
        baselines.reduce(0) { delta, entry in
            let isFollowing = states[entry.key]?.isFollowing ?? entry.value
            return delta + (isFollowing ? 1 : 0) - (entry.value ? 1 : 0)
        }
    }

    // MARK: - Affichage

    /// Le profil avec son dernier état d'abonnement connu, quel que soit l'écran qui l'a changé.
    func displayed(_ profile: UserProfile) -> UserProfile {
        guard let state = states[profile.id] else { return profile }
        var profile = profile
        if let count = state.followerCount {
            profile.followerCount = count
        } else if state.isFollowing != profile.isFollowing {
            // Suivi depuis un autre écran, sans nombre d'abonnés connu : le compteur affiché suit.
            profile.followerCount = max(0, profile.followerCount + (state.isFollowing ? 1 : -1))
        }
        profile.isFollowing = state.isFollowing
        // Compte privé que je ne suis plus : ses contenus disparaissent sans attendre l'API.
        if profile.isPrivate, !state.isFollowing {
            profile.canViewContent = false
        }
        return profile
    }

    /// Le compte avec son dernier état d'abonnement connu.
    func displayed(_ user: UserSummary) -> UserSummary {
        guard let state = states[user.id] else { return user }
        var user = user
        user.isFollowing = state.isFollowing
        return user
    }

    /// Mon profil, avec mon compteur « suivi(e)s » à jour des follows faits depuis son chargement.
    func displayed(me profile: Profile) -> Profile {
        var profile = profile
        profile.followingCount = max(0, profile.followingCount + followingCountDelta)
        return profile
    }

    // MARK: - Réponses de l'API

    /// Profil reçu de l'API : son état devient le dernier connu, sauf pendant un follow en cours.
    func record(_ profile: UserProfile) {
        guard !sync.isSyncing(profile.id) else { return }
        states[profile.id] = FollowState(isFollowing: profile.isFollowing, followerCount: profile.followerCount)
    }

    /// Comptes reçus de l'API (listes, recherche) : sans nombre d'abonnés, gardé s'il est toujours valable.
    func record(_ users: [UserSummary]) {
        for user in users where !sync.isSyncing(user.id) {
            let known = states[user.id]
            states[user.id] = FollowState(
                isFollowing: user.isFollowing,
                followerCount: known?.isFollowing == user.isFollowing ? known?.followerCount : nil
            )
        }
    }

    /// Mon profil vient d'être rechargé : son compteur « suivi(e)s » compte déjà les follows confirmés.
    func myProfileReloaded() {
        baselines = baselines.filter { sync.isSyncing($0.key) }
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        states = [:]
        baselines = [:]
        sync.reset()
    }

    // MARK: - Suivre

    /**
     Suivre ou ne plus suivre `userId`, affiché avec l'état `current` s'il n'est pas encore connu.

     `nil` si rien n'a été envoyé : état déjà voulu, ou appel déjà en cours (c'est lui qui enverra le nouvel
     état et rendra l'issue à l'écran qui l'a lancé).
     */
    func setFollowing(
        _ following: Bool,
        userId: String,
        current: FollowState,
        source: FollowSource
    ) async -> FollowOutcome? {
        let shown = states[userId] ?? current
        guard shown.isFollowing != following else { return nil }
        if baselines[userId] == nil {
            baselines[userId] = shown.isFollowing
        }
        var optimistic = shown
        optimistic.setFollowing(following)
        states[userId] = optimistic

        let outcome = await sync.sync(
            userId,
            to: following,
            confirmed: shown,
            intentOf: \.isFollowing
        ) { wanted throws(SocialServiceError) -> FollowState in
            let status = try await wanted ? service.follow(userId: userId) : service.unfollow(userId: userId)
            return FollowState(isFollowing: status.isFollowing, followerCount: status.followerCount)
        }
        switch outcome {
        case .pending:
            return nil
        case let .confirmed(state):
            states[userId] = state
            // Follow confirmé par l'API (ADR-013) ; un unfollow n'est pas suivi.
            if state.isFollowing, !shown.isFollowing {
                analytics.track(.userFollowed(source))
            }
            return .confirmed
        case let .failed(.userNotFound, _, confirmed):
            states[userId] = confirmed
            return .userGone
        case let .failed(error, wanted, confirmed):
            states[userId] = confirmed
            return .reverted(message: Self.message(for: error, following: wanted))
        }
    }

    /// Message compréhensible, sans détail technique (ADR-014).
    static func message(for error: SocialServiceError, following: Bool) -> String {
        switch error {
        case .accountPrivate:
            "Ce compte est privé : il ne peut pas encore être suivi."
        case .unauthenticated:
            "Votre session a expiré. Reconnectez-vous."
        default:
            following
                ? "Impossible de suivre ce compte. Vérifiez votre connexion et réessayez."
                : "Impossible de ne plus suivre ce compte. Vérifiez votre connexion et réessayez."
        }
    }
}

extension FollowState {
    /// État affiché d'un profil, avec son nombre d'abonnés.
    init(_ profile: UserProfile) {
        self.init(isFollowing: profile.isFollowing, followerCount: profile.followerCount)
    }

    /// État affiché d'une ligne de liste, sans nombre d'abonnés.
    init(_ user: UserSummary) {
        self.init(isFollowing: user.isFollowing, followerCount: nil)
    }
}
