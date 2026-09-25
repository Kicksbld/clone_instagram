import Foundation

/// Assemblage des dépendances de l'app (ADR-010) : services injectés par protocole.
struct AppDependencies {
    let auth: any AuthService
    let identity: any IdentityService

    static func live(bundle: Bundle = .main) -> AppDependencies {
        let auth: any AuthService = if let configuration = try? SupabaseConfiguration(bundle: bundle) {
            SupabaseAuthService(configuration: configuration)
        } else {
            UnavailableAuthService()
        }
        let identity: any IdentityService = if let configuration = try? APIConfiguration(bundle: bundle) {
            APIIdentityService(
                client: APIClientFactory.makeClient(configuration: configuration) { await auth.accessToken() }
            )
        } else {
            UnavailableIdentityService()
        }
        return AppDependencies(auth: auth, identity: identity)
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide : l'app affiche une erreur au lieu de planter.
struct UnavailableIdentityService: IdentityService {
    func fetchMe() async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func checkUsername(_: String) async throws(IdentityServiceError) -> UsernameAvailability {
        throw .unreachable
    }

    func completeOnboarding(username _: String, fullName _: String, birthDate _: BirthDate) async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func updateMe(_: ProfileChanges) async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }
}
