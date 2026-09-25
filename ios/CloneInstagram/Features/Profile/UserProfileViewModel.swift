import Foundation
import Observation

/// Profil d'un autre utilisateur (`GET /v1/users/{username}`) : chargement, introuvable, erreur ;
/// bouton Suivre optimiste avec retour arrière si l'API échoue (ADR-010).
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
    private(set) var state: State = .loading
    /// Follow ou unfollow en cours : le bouton ne relance pas d'appel.
    private(set) var isUpdatingFollow = false
    /// Échec d'un follow ou d'un unfollow, affiché en alerte ; `nil` une fois l'alerte fermée.
    var followErrorMessage: String?

    private let viewerId: String
    private let identity: any IdentityService
    private let social: any SocialService
    private let onFollowChange: () async -> Void

    private var isLoaded: Bool {
        if case .loaded = state {
            true
        } else {
            false
        }
    }

    /// - Parameter onFollowChange: appelé après un follow ou un unfollow réussi (mes compteurs changent).
    init(
        username: String,
        viewerId: String,
        identity: any IdentityService,
        social: any SocialService,
        onFollowChange: @escaping () async -> Void = {}
    ) {
        self.username = username
        self.viewerId = viewerId
        self.identity = identity
        self.social = social
        self.onFollowChange = onFollowChange
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
            state = .loading
        }
        do {
            state = try await .loaded(identity.fetchUserProfile(username: username))
        } catch .userNotFound, .invalidInput {
            state = .notFound
        } catch {
            state = .failed(message: "Impossible de charger ce profil. Vérifiez votre connexion et réessayez.")
        }
    }

    func follow() async {
        await setFollowing(true)
    }

    func unfollow() async {
        await setFollowing(false)
    }

    private func setFollowing(_ following: Bool) async {
        guard case var .loaded(profile) = state, !isUpdatingFollow, profile.isFollowing != following else { return }
        let previous = profile
        isUpdatingFollow = true
        defer { isUpdatingFollow = false }

        profile.isFollowing = following
        profile.followerCount = max(0, profile.followerCount + (following ? 1 : -1))
        state = .loaded(profile)
        do {
            let status = if following {
                try await social.follow(userId: profile.id)
            } else {
                try await social.unfollow(userId: profile.id)
            }
            profile.isFollowing = status.isFollowing
            profile.followerCount = status.followerCount
            state = .loaded(profile)
            await onFollowChange()
        } catch .userNotFound {
            state = .notFound
        } catch .accountPrivate {
            state = .loaded(previous)
            followErrorMessage = "Ce compte est privé : il ne peut pas encore être suivi."
        } catch {
            state = .loaded(previous)
            followErrorMessage = following
                ? "Impossible de suivre ce compte. Vérifiez votre connexion et réessayez."
                : "Impossible de ne plus suivre ce compte. Vérifiez votre connexion et réessayez."
        }
    }
}
