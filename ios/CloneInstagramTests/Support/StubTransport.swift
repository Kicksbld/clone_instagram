import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Transport factice pour le client généré : renvoie une réponse préparée ou une erreur, sans réseau.
nonisolated struct StubTransport: ClientTransport {
    enum Reply: Sendable {
        case response(status: Int, contentType: String?, body: String?)
        case failure
    }

    struct TransportFailure: Error {}

    let reply: Reply

    func send(
        _: HTTPRequest,
        body _: HTTPBody?,
        baseURL _: URL,
        operationID _: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        switch reply {
        case .failure:
            throw TransportFailure()
        case let .response(status, contentType, body):
            var response = HTTPResponse(status: .init(code: status))
            if let contentType {
                response.headerFields[.contentType] = contentType
            }
            return (response, body.map { HTTPBody($0) })
        }
    }
}
