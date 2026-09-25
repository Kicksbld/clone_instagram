import Foundation

/// Assemblage des dépendances de l'app (ADR-010) : services injectés par protocole.
struct AppDependencies {
    let auth: any AuthService
    let identity: any IdentityService
    let uploads: any UploadService

    static func live(bundle: Bundle = .main) -> AppDependencies {
        let auth: any AuthService = if let configuration = try? SupabaseConfiguration(bundle: bundle) {
            SupabaseAuthService(configuration: configuration)
        } else {
            UnavailableAuthService()
        }
        guard let configuration = try? APIConfiguration(bundle: bundle) else {
            return AppDependencies(auth: auth, identity: UnavailableIdentityService(), uploads: UnavailableUploadService())
        }
        let client = APIClientFactory.makeClient(configuration: configuration) { await auth.accessToken() }
        return AppDependencies(
            auth: auth,
            identity: APIIdentityService(client: client),
            uploads: UploadManager(media: APIMediaService(client: client), uploader: BackgroundFileUploader.shared)
        )
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableUploadService: UploadService {
    func uploadImage(_: Data, purpose _: MediaPurpose) async throws(UploadError) -> String {
        throw .unreachable
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

    func removeAvatar() async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }
}
