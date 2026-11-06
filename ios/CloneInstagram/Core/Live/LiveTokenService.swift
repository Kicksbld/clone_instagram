import APIClient
import Foundation
import OpenAPIRuntime

enum LiveTokenServiceError: Error, Equatable {
    /// Onboarding non terminé ou Live non configuré sur l'API (`404`).
    case unavailable
    /// JWT absent ou invalide (`401`).
    case unauthenticated
    /// `429 rate_limited`.
    case rateLimited
    /// L'API n'a pas pu être jointe.
    case unreachable
    /// Réponse non prévue par le contrat.
    case unexpectedResponse(statusCode: Int)
}

/// Jeton de Participant du Live commun (echimine/live-sdk), signé par l'API, jamais par l'app.
protocol LiveTokenService: Sendable {
    /// `POST /v1/live/participant-token`, appelé par le SDK à chaque connexion.
    func participantToken() async throws(LiveTokenServiceError) -> String
}

/// Serveur Live commun aux clones.
enum LiveServer {
    static let url = URL(string: "https://live.echimine.fr")!
}

/// `LiveTokenService` sur le client généré (ADR-003).
struct APILiveTokenService: LiveTokenService {
    let client: any APIProtocol

    func participantToken() async throws(LiveTokenServiceError) -> String {
        let output: Operations.CreateLiveParticipantToken.Output
        do {
            output = try await client.createLiveParticipantToken()
        } catch {
            throw .unreachable
        }
        switch output {
        case let .ok(response):
            guard let body = try? response.body.json else { throw .unexpectedResponse(statusCode: 200) }
            return body.token
        case .unauthorized:
            throw .unauthenticated
        case .notFound:
            throw .unavailable
        case .tooManyRequests:
            throw .rateLimited
        case .internalServerError:
            throw .unexpectedResponse(statusCode: 500)
        case let .undocumented(statusCode, _):
            throw .unexpectedResponse(statusCode: statusCode)
        }
    }
}
