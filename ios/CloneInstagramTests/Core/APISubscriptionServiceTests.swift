import Foundation
import Testing
@testable import CloneInstagram

struct APISubscriptionServiceTests {
    private func makeService(_ reply: StubTransport.Reply) throws -> APISubscriptionService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APISubscriptionService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `plan plus avec date de fin`() async throws {
        let body = #"{"plan":"plus","expiresAt":"2026-10-25T12:00:00.000Z"}"#
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let status = try await service.refresh()

        #expect(status.plan == .plus)
        #expect(status.expiresAt == ISO8601DateFormatter().date(from: "2026-10-25T12:00:00Z"))
    }

    @Test func `plan free sans date`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: #"{"plan":"free"}"#))

        #expect(try await service.refresh() == .free)
    }

    @Test(arguments: [
        (404, "profile_not_found", SubscriptionServiceError.profileNotFound),
        (401, "unauthenticated", .unauthenticated),
        (429, "rate_limited", .rateLimited),
    ])
    func `erreurs selon le statut`(status: Int, code: String, expected: SubscriptionServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.refresh() }
    }

    @Test func `réseau coupé → unreachable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: SubscriptionServiceError.unreachable) { try await service.refresh() }
    }
}
