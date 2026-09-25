import Foundation
import Observation

/// Routeur racine (ADR-010) : non connecté → bienvenue ; session sans profil → onboarding ; sinon accueil.
@Observable
final class RootViewModel {
    enum Route: Equatable {
        /// Lancement : lecture de la session et de `GET /v1/me`.
        case loading
        case welcome
        case login
        case onboarding(OnboardingEntry)
        case home(Profile)
        case failed(message: String)
    }

    private(set) var route: Route = .loading

    private let auth: any AuthService
    private let identity: any IdentityService

    init(auth: any AuthService, identity: any IdentityService) {
        self.auth = auth
        self.identity = identity
    }

    func start() async {
        route = .loading
        guard let provider = auth.currentProvider else {
            route = .welcome
            return
        }
        do {
            route = try await .home(identity.fetchMe())
        } catch .profileNotFound {
            route = .onboarding(.resume(provider))
        } catch .unauthenticated {
            await auth.signOut()
            route = .welcome
        } catch {
            route = .failed(message: "Impossible de charger votre compte. Vérifiez votre connexion et réessayez.")
        }
    }

    func showSignUp() {
        route = .onboarding(.newAccount)
    }

    func showLogin() {
        route = .login
    }

    func showWelcome() {
        route = .welcome
    }

    func finishOnboarding(with profile: Profile) {
        route = .home(profile)
    }

    /// Profil modifié depuis l'accueil (photo, nom, bio…).
    func updateProfile(_ profile: Profile) {
        guard case .home = route else { return }
        route = .home(profile)
    }

    func signOut() async {
        await auth.signOut()
        route = .welcome
    }
}
