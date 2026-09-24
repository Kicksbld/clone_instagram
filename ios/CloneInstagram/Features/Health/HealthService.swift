import APIClient
import Foundation

protocol HealthService {
    func fetchStatus() async throws(HealthServiceError) -> HealthStatus
}

enum HealthServiceError: Error, Equatable {
    /// Configuration de l'app incomplète (URL de l'API absente ou invalide).
    case misconfigured
    /// L'API n'a pas pu être jointe (réseau, serveur arrêté).
    case unreachable
    /// L'API a répondu autre chose que ce que prévoit le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Appelle `GET /health` via le client généré et convertit la réponse en modèle de l'app.
struct APIHealthService: HealthService {
    let client: any APIProtocol

    func fetchStatus() async throws(HealthServiceError) -> HealthStatus {
        let output: Operations.GetHealth.Output
        do {
            output = try await client.getHealth()
        } catch {
            throw .unreachable
        }

        switch output {
        case let .ok(response):
            switch response.body {
            case let .json(health):
                return HealthStatus(health)
            }
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }
}

/// Service utilisé quand la configuration de l'API est invalide : l'écran affiche l'erreur au lieu de planter.
struct UnavailableHealthService: HealthService {
    let error: APIConfigurationError

    func fetchStatus() async throws(HealthServiceError) -> HealthStatus {
        throw .misconfigured
    }
}

private extension HealthStatus {
    init(_ health: Components.Schemas.Health) {
        switch health.status {
        case .ok:
            self = .ok
        }
    }
}
