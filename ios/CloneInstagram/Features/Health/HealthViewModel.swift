import Observation

@Observable
final class HealthViewModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded(HealthStatus)
        case failed(message: String)
    }

    private(set) var state: State = .idle

    private let service: any HealthService

    init(service: any HealthService) {
        self.service = service
    }

    func load() async {
        state = .loading
        do {
            state = try await .loaded(service.fetchStatus())
        } catch {
            state = .failed(message: Self.message(for: error))
        }
    }

    private static func message(for error: HealthServiceError) -> String {
        switch error {
        case .misconfigured:
            "L'adresse de l'API n'est pas configurée. Vérifiez le fichier .xcconfig."
        case .unreachable:
            "Impossible de joindre l'API. Vérifiez qu'elle est lancée et que l'adresse est correcte."
        case let .unexpectedResponse(statusCode):
            "L'API a répondu de façon inattendue (code \(statusCode))."
        }
    }
}
