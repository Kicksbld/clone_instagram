import Foundation
import Testing
@testable import CloneInstagram

struct APISocialServiceFollowRequestTests {
    private static let userId = "0199a1b2-5eed-7000-8000-000000000002"

    private func makeService(_ reply: StubTransport.Reply) throws -> APISocialService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APISocialService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `demandes reçues converties en UserPage`() async throws {
        let body = """
        {"items":[{"id":"0199a1b2-5eed-7000-8000-000000000002","username":"hugo.bernard","fullName":"Hugo Bernard",\
        "isPrivate":false,"relationship":{"following":false,"followedBy":false,"requested":false}}],"nextCursor":"abc"}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let page = try await service.listFollowRequests(cursor: nil)

        #expect(page == UserPage(items: [.fixture()], nextCursor: "abc"))
    }

    @Test func `accepter, refuser, retirer un abonné → 204`() async throws {
        let service = try makeService(.response(status: 204, contentType: nil, body: nil))

        try await service.acceptFollowRequest(from: Self.userId)
        try await service.declineFollowRequest(from: Self.userId)
        try await service.removeFollower(userId: Self.userId)
    }

    @Test func `demande annulée entre-temps → followRequestNotFound`() async throws {
        let service = try makeService(problem(404, "follow_request_not_found"))

        await #expect(throws: SocialServiceError.followRequestNotFound) {
            try await service.acceptFollowRequest(from: Self.userId)
        }
        await #expect(throws: SocialServiceError.followRequestNotFound) {
            try await service.declineFollowRequest(from: Self.userId)
        }
    }

    @Test(arguments: [
        (404, "user_not_found", SocialServiceError.userNotFound),
        (422, "cannot_follow_self", .cannotFollowSelf),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs du retrait d'un abonné selon le code`(status: Int, code: String, expected: SocialServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.removeFollower(userId: Self.userId) }
    }

    @Test func `profil d'un compte demandé : relation « Demandé » convertie`() async throws {
        let body = """
        {"items":[{"id":"0199a1b2-5eed-7000-8000-000000000002","username":"hugo.bernard","fullName":"Hugo Bernard",\
        "isPrivate":true,"relationship":{"following":false,"followedBy":false,"requested":true}}]}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let results = try await service.searchUsers("hugo")

        #expect(results == [.fixture(isPrivate: true, isRequested: true)])
    }
}
