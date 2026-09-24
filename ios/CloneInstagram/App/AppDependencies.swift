import Foundation

/// Assemblage des dépendances de l'app (ADR-010) : services injectés par protocole.
struct AppDependencies {
    let apiConfiguration: Result<APIConfiguration, APIConfigurationError>
    let healthService: any HealthService

    static func live(bundle: Bundle = .main) -> AppDependencies {
        let configuration = Result { try APIConfiguration(bundle: bundle) }
            .mapError { $0 as? APIConfigurationError ?? .missingBaseURL }
        let healthService: any HealthService = switch configuration {
        case let .success(configuration):
            APIHealthService(client: APIClientFactory.makeClient(configuration: configuration))
        case let .failure(error):
            UnavailableHealthService(error: error)
        }
        return AppDependencies(apiConfiguration: configuration, healthService: healthService)
    }
}
