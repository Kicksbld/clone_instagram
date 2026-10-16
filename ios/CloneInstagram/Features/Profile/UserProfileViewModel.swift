import Foundation
import Observation

/// Profil d'un autre utilisateur (`GET /v1/users/{username}`) : chargement, introuvable, erreur ;
/// bouton Suivre optimiste partagé avec les autres écrans (`FollowStore`, ADR-020).
@Observable
final class UserProfileViewModel {
    enum State: Equatable {
        case loading
        case loaded(UserProfile)
        /// Inexistant, bloqué ou compte non actif : même écran, sans révéler la raison (ADR-006).
        case notFound
        case failed(message: String)
    }

    let username: String
    /// Profil reçu de l'API, affiché avec l'abonnement partagé par `FollowStore`.
    private var loadState: State = .loading
    /// Échec d'un follow ou d'un unfollow, affiché en alerte ; `nil` une fois l'alerte fermée.
    var followErrorMessage: String?

    private let viewerId: String
    private let identity: any IdentityService
    private let follows: FollowStore

    var state: State {
        if case let .loaded(profile) = loadState {
            .loaded(follows.displayed(profile))
        } else {
            loadState
        }
    }

    private var isLoaded: Bool {
        if case .loaded = loadState {
            true
        } else {
            false
        }
    }

    init(username: String, viewerId: String, identity: any IdentityService, follows: FollowStore) {
        self.username = username
        self.viewerId = viewerId
        self.identity = identity
        self.follows = follows
    }

    /// Mon propre profil ouvert depuis une liste : pas de bouton Suivre.
    func isSelf(_ profile: UserProfile) -> Bool {
        profile.id == viewerId
    }

    /// Pas de bouton Suivre sur un compte privé que je ne suis pas (demandes d'abonnement en P1).
    func canFollow(_ profile: UserProfile) -> Bool {
        !isSelf(profile) && (profile.isFollowing || !profile.isPrivate)
    }

    func load() async {
        // Rafraîchissement : le profil affiché reste à l'écran pendant le chargement.
        if !isLoaded {
            loadState = .loading
        }
        do {
            let profile = try await identity.fetchUserProfile(username: username)
            follows.record(profile)
            loadState = .loaded(profile)
        } catch .userNotFound, .invalidInput {
            loadState = .notFound
        } catch {
            loadState = .failed(message: "Impossible de charger ce profil. Vérifiez votre connexion et réessayez.")
        }
    }

    func follow() async {
        await setFollowing(true)
    }

    func unfollow() async {
        await setFollowing(false)
    }

    /// Changé tout de suite, sans bloquer le bouton : un nouveau tap pendant l'appel est pris en compte.
    private func setFollowing(_ following: Bool) async {
        guard case let .loaded(profile) = state, profile.isFollowing != following else { return }
        let outcome = await follows.setFollowing(
            following,
            userId: profile.id,
            current: FollowState(profile),
            source: .profile
        )
        switch outcome {
        case nil, .confirmed?:
            break
        case .userGone?:
            loadState = .notFound
        case let .reverted(message)?:
            followErrorMessage = message
        }
    }
}
