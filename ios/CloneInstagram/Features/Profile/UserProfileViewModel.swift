import Foundation
import Observation

/// Profil d'un autre utilisateur (`GET /v1/users/{username}`) : chargement, introuvable, erreur.
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

    private let identity: any IdentityService

    private var isLoaded: Bool {
        if case .loaded = state {
            true
        } else {
            false
        }
    }

    init(username: String, identity: any IdentityService) {
        self.username = username
        self.identity = identity
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
}
