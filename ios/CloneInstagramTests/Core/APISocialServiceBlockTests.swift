import Foundation
import Testing
@testable import CloneInstagram

struct APISocialServiceBlockTests {
    private static let userId = "0199a1b2-5eed-7000-8000-000000000001"

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

    @Test func `PUT et DELETE block → 204`() async throws {
        let service = try makeService(.response(status: 204, contentType: nil, body: nil))

        try await service.block(userId: Self.userId)
        try await service.unblock(userId: Self.userId)
    }

    @Test(arguments: [
        (404, "user_not_found", SocialServiceError.userNotFound),
        (404, "profile_not_found", .profileNotFound),
        (422, "cannot_block_self", .cannotBlockSelf),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs du blocage selon le code`(status: Int, code: String, expected: SocialServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.block(userId: Self.userId) }
        await #expect(throws: expected) { try await service.unblock(userId: Self.userId) }
    }

    @Test func `liste des bloqués convertie en UserPage`() async throws {
        let body = """
        {"items":[{"id":"0199a1b2-5eed-7000-8000-000000000002","username":"hugo.bernard","fullName":"Hugo Bernard",\
        "isPrivate":false,"relationship":{"following":false,"followedBy":false}}],"nextCursor":"abc"}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let page = try await service.listBlocks(cursor: nil)

        #expect(page == UserPage(items: [.fixture()], nextCursor: "abc"))
    }

    @Test func `curseur invalide → invalidCursor ; réseau coupé → unreachable`() async throws {
        let invalid = try makeService(problem(400, "invalid_cursor"))
        await #expect(throws: SocialServiceError.invalidCursor) { try await invalid.listBlocks(cursor: "x") }
        let offline = try makeService(.failure)
        await #expect(throws: SocialServiceError.unreachable) { try await offline.block(userId: Self.userId) }
    }
}
