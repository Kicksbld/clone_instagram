import Foundation
import Testing
@testable import CloneInstagram

struct APIReportServiceTests {
    private static let targetId = "0199a1b2-0000-7000-a000-000000000001"

    private func makeService(_ reply: StubTransport.Reply) throws -> APIReportService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIReportService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test(arguments: [
        ReportRoute.Target.post(id: "0199a1b2-0000-7000-a000-000000000001"),
        .comment(id: "0199a1b2-0000-7000-b100-000000000001"),
        .user(id: "0199a1b2-0000-7000-8000-000000000002"),
    ])
    func `POST /reports → 201`(target: ReportRoute.Target) async throws {
        let body = #"{"id":"0199a1b2-0000-7000-c100-000000000001"}"#
        let service = try makeService(.response(status: 201, contentType: "application/json", body: body))

        try await service.report(target, reason: .other, details: "Arnaque")
    }

    @Test(arguments: [
        (404, "post_not_found", ReportServiceError.targetNotFound),
        (404, "comment_not_found", .targetNotFound),
        (404, "user_not_found", .targetNotFound),
        (404, "profile_not_found", .profileNotFound),
        (422, "cannot_report_self", .cannotReportSelf),
        (400, "validation_failed", .invalidInput),
    ])
    func `erreurs selon le code`(status: Int, code: String, expected: ReportServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) {
            try await service.report(.post(id: Self.targetId), reason: .spam, details: nil)
        }
    }

    @Test func `trop de signalements (429) → rateLimited`() async throws {
        let service = try makeService(problem(429, "rate_limited"))

        await #expect(throws: ReportServiceError.rateLimited(retryAfter: nil)) {
            try await service.report(.user(id: Self.targetId), reason: .spam, details: nil)
        }
    }
}
