import Foundation
import Testing
@testable import CloneInstagram

struct APIHealthServiceTests {
    private func makeService(_ reply: StubTransport.Reply) throws -> APIHealthService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        let client = APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        return APIHealthService(client: client)
    }

    @Test func `réponse 200 ok convertie en statut ok`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: #"{"status":"ok"}"#))

        let status = try await service.fetchStatus()

        #expect(status == .ok)
    }

    @Test func `réponse 500 Problem Details donne une réponse inattendue`() async throws {
        let problem = #"{"type":"about:blank","title":"Internal Server Error","status":500,"detail":"x","code":"internal_error"}"#
        let service = try makeService(.response(status: 500, contentType: "application/problem+json", body: problem))

        await #expect(throws: HealthServiceError.unexpectedResponse(statusCode: 500)) {
            try await service.fetchStatus()
        }
    }

    @Test func `statut non documenté donne une réponse inattendue`() async throws {
        let service = try makeService(.response(status: 503, contentType: nil, body: nil))

        await #expect(throws: HealthServiceError.unexpectedResponse(statusCode: 503)) {
            try await service.fetchStatus()
        }
    }

    @Test func `erreur réseau donne API injoignable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: HealthServiceError.unreachable) {
            try await service.fetchStatus()
        }
    }

    @Test func `corps non conforme au contrat donne API injoignable`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: #"{"status":"ko"}"#))

        await #expect(throws: HealthServiceError.unreachable) {
            try await service.fetchStatus()
        }
    }
}
