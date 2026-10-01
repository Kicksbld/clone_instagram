import Testing
@testable import CloneInstagram

struct APIEngagementServiceTests {
    private static let postId = "0199a1b2-0000-7000-a000-000000000001"

    private func makeService(_ reply: StubTransport.Reply) throws -> APIEngagementService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIEngagementService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `PUT like converti en LikeStatus`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: #"{"liked":true,"likeCount":12}"#))

        #expect(try await service.like(postId: Self.postId) == LikeStatus(isLiked: true, likeCount: 12))
    }

    @Test func `DELETE like converti en LikeStatus`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: #"{"liked":false,"likeCount":0}"#))

        #expect(try await service.unlike(postId: Self.postId) == LikeStatus(isLiked: false, likeCount: 0))
    }

    @Test(arguments: [
        (404, "post_not_found", EngagementServiceError.postNotFound),
        (404, "profile_not_found", .profileNotFound),
        (400, "validation_failed", .invalidInput),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs selon le code`(status: Int, code: String, expected: EngagementServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.like(postId: Self.postId) }
        await #expect(throws: expected) { try await service.unlike(postId: Self.postId) }
    }

    @Test func `trop de requêtes (429) → rateLimited`() async throws {
        let service = try makeService(problem(429, "rate_limited"))

        await #expect(throws: EngagementServiceError.rateLimited(retryAfter: nil)) {
            try await service.like(postId: Self.postId)
        }
    }

    @Test func `API injoignable → unreachable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: EngagementServiceError.unreachable) { try await service.unlike(postId: Self.postId) }
    }
}
