import Foundation
import Testing
@testable import CloneInstagram

struct APISocialServiceTests {
    private static let userId = "0199a1b2-5eed-7000-8000-000000000001"
    private static let summaryJSON = """
    {"id":"0199a1b2-5eed-7000-8000-000000000002","username":"hugo.bernard","fullName":"Hugo Bernard",\
    "isPrivate":false,"relationship":{"following":true,"followedBy":false}}
    """

    private func makeService(_ reply: StubTransport.Reply) throws -> APISocialService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APISocialService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func json(_ body: String) -> StubTransport.Reply {
        .response(status: 200, contentType: "application/json", body: body)
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `PUT follow converti en FollowStatus`() async throws {
        let service = try makeService(json(#"{"following":true,"followerCount":12}"#))

        let status = try await service.follow(userId: Self.userId)

        #expect(status == FollowStatus(isFollowing: true, followerCount: 12))
    }

    @Test(arguments: [
        (403, "account_private", SocialServiceError.accountPrivate),
        (404, "user_not_found", .userNotFound),
        (404, "profile_not_found", .profileNotFound),
        (422, "cannot_follow_self", .cannotFollowSelf),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs du follow selon le code`(status: Int, code: String, expected: SocialServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.follow(userId: Self.userId) }
    }

    @Test func `DELETE follow converti en FollowStatus`() async throws {
        let service = try makeService(json(#"{"following":false,"followerCount":11}"#))

        let status = try await service.unfollow(userId: Self.userId)

        #expect(status == FollowStatus(isFollowing: false, followerCount: 11))
    }

    @Test(arguments: [FollowListKind.followers, .following])
    func `page d'une liste convertie, curseur suivant compris`(kind: FollowListKind) async throws {
        let service = try makeService(json(#"{"items":[\#(Self.summaryJSON)],"nextCursor":"abc"}"#))

        let page = try await service.list(kind, of: Self.userId, cursor: nil)

        #expect(page == UserPage(
            items: [.fixture(isFollowing: true)],
            nextCursor: "abc"
        ))
    }

    @Test func `dernière page : pas de curseur`() async throws {
        let service = try makeService(json(#"{"items":[]}"#))

        let page = try await service.list(.followers, of: Self.userId, cursor: "abc")

        #expect(page == UserPage(items: [], nextCursor: nil))
    }

    @Test(arguments: [
        (400, "invalid_cursor", SocialServiceError.invalidCursor),
        (404, "user_not_found", .userNotFound),
    ])
    func `erreurs des listes selon le code`(status: Int, code: String, expected: SocialServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.list(.following, of: Self.userId, cursor: "x") }
    }

    @Test func `recherche convertie en résumés`() async throws {
        let service = try makeService(json(#"{"items":[\#(Self.summaryJSON)]}"#))

        let users = try await service.searchUsers("hugo")

        #expect(users == [.fixture(isFollowing: true)])
    }

    @Test func `API injoignable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: SocialServiceError.unreachable) { try await service.searchUsers("hugo") }
    }
}
