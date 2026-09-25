import Foundation
import Testing
@testable import CloneInstagram

struct APIPostServiceTests {
    private static let postJSON = """
    {"id":"0199a1b2-0000-7000-a000-000000000001","kind":"post","caption":"Salut",\
    "author":{"id":"0199a1b2-5eed-7000-8000-000000000001","username":"killian"},\
    "media":[{"variants":{"thumb":"http://s/t.webp","medium":"http://s/m.webp","large":"http://s/l.webp"},\
    "width":1080,"height":1440}],"createdAt":"2026-09-25T12:00:00.000Z"}
    """

    private func makeService(_ reply: StubTransport.Reply) throws -> APIPostService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIPostService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func json(_ body: String, status: Int = 200) -> StubTransport.Reply {
        .response(status: status, contentType: "application/json", body: body)
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `POST posts converti en Post`() async throws {
        let service = try makeService(json(Self.postJSON, status: 201))

        let post = try await service.createPost(caption: "Salut", mediaIds: ["0199a1b2-0000-7000-9000-000000000001"])

        #expect(post.id == "0199a1b2-0000-7000-a000-000000000001")
        #expect(post.caption == "Salut")
        #expect(post.author == PostAuthor(id: "0199a1b2-5eed-7000-8000-000000000001", username: "killian", avatar: nil))
        #expect(post.media.map(\.width) == [1080])
        #expect(post.media.first?.variants.large == URL(string: "http://s/l.webp"))
        #expect(post.createdAt == Date(timeIntervalSince1970: 1_790_337_600))
    }

    @Test(arguments: [
        (404, "media_not_found", PostServiceError.mediaNotFound),
        (404, "profile_not_found", .profileNotFound),
        (409, "media_not_ready", .mediaNotReady),
        (409, "media_already_attached", .mediaAlreadyAttached),
        (422, "media_purpose_mismatch", .mediaPurposeMismatch),
        (400, "validation_failed", .invalidInput),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs de la publication selon le code`(status: Int, code: String, expected: PostServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.createPost(caption: "", mediaIds: ["0199a1b2-0000-7000-9000-000000000001"]) }
    }

    @Test func `trop de publications (429) → rateLimited`() async throws {
        let service = try makeService(problem(429, "rate_limited"))

        await #expect(throws: PostServiceError.rateLimited(retryAfter: nil)) {
            try await service.createPost(caption: "", mediaIds: ["0199a1b2-0000-7000-9000-000000000001"])
        }
    }

    @Test func `GET post invisible → postNotFound`() async throws {
        let service = try makeService(problem(404, "post_not_found"))

        await #expect(throws: PostServiceError.postNotFound) { try await service.fetchPost(id: "0199a1b2-0000-7000-a000-000000000001") }
    }

    @Test func `page de posts convertie, curseur suivant compris`() async throws {
        let service = try makeService(json(#"{"items":[\#(Self.postJSON)],"nextCursor":"abc"}"#))

        let page = try await service.listPosts(of: "0199a1b2-5eed-7000-8000-000000000001", cursor: nil)

        #expect(page.items.map(\.id) == ["0199a1b2-0000-7000-a000-000000000001"])
        #expect(page.nextCursor == "abc")
    }

    @Test(arguments: [
        (404, "user_not_found", PostServiceError.userNotFound),
        (400, "invalid_cursor", .invalidCursor),
    ])
    func `erreurs de la grille selon le code`(status: Int, code: String, expected: PostServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.listPosts(of: "0199a1b2-5eed-7000-8000-000000000001", cursor: "x") }
    }

    @Test func `API injoignable → unreachable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: PostServiceError.unreachable) { try await service.fetchPost(id: "0199a1b2-0000-7000-a000-000000000001") }
    }

    @Test func `DELETE post (204) → succès`() async throws {
        let service = try makeService(.response(status: 204, contentType: nil, body: nil))

        try await service.deletePost(id: "0199a1b2-0000-7000-a000-000000000001")
    }

    @Test func `DELETE post déjà supprimé ou d'un autre (404) → postNotFound`() async throws {
        let service = try makeService(problem(404, "post_not_found"))

        await #expect(throws: PostServiceError.postNotFound) {
            try await service.deletePost(id: "0199a1b2-0000-7000-a000-000000000001")
        }
    }
}
