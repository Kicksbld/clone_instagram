import Foundation
import Testing
@testable import CloneInstagram

struct APIPostServiceTests {
    private static let postJSON = """
    {"id":"0199a1b2-0000-7000-a000-000000000001","kind":"post","caption":"Salut",\
    "author":{"id":"0199a1b2-5eed-7000-8000-000000000001","username":"killian"},\
    "media":[{"variants":{"thumb":"http://s/t.webp","medium":"http://s/m.webp","large":"http://s/l.webp"},\
    "width":1080,"height":1440}],"likeCount":3,"viewerHasLiked":true,"commentCount":4,"createdAt":"2026-09-25T12:00:00.000Z"}
    """

    @Test func `reel converti avec HLS et durée`() async throws {
        let body = Self.postJSON.replacingOccurrences(of: "\"kind\":\"post\"", with: "\"kind\":\"reel\"")
            .replacingOccurrences(
                of: "\"thumb\":\"http://s/t.webp\",\"medium\":\"http://s/m.webp\",\"large\":\"http://s/l.webp\"",
                with: "\"hls\":\"http://s/master.m3u8\",\"thumbnail\":\"http://s/t.webp\""
            )
            .replacingOccurrences(of: "\"width\":1080", with: "\"durationMs\":20000,\"width\":1080")
        let service = try makeService(json(body))
        let post = try await service.fetchPost(id: "reel")
        #expect(post.kind == .reel)
        #expect(post.media.first?.hls == URL(string: "http://s/master.m3u8"))
        #expect(post.media.first?.durationMs == 20000)
    }

    @Test func `fil Reels converti en page avec curseur`() async throws {
        let service = try makeService(json("{\"items\":[\(Self.postJSON)],\"nextCursor\":\"next\"}"))
        let page = try await service.listReelsFeed(cursor: "previous")
        #expect(page.items.count == 1)
        #expect(page.items.first?.caption == "Salut")
        #expect(page.nextCursor == "next")
    }

    @Test func `onglet Amis : aperçus et nombre d’amis convertis, type inconnu ignoré`() async throws {
        let friends = #","friendInteractions":[{"user":{"id":"0199a1b2-5eed-7000-8000-000000000002","username":"lea"},"#
            + #""kinds":["liked","commented","reposted"],"commentText":"Top"}],"friendInteractionCount":3}"#
        let item = String(Self.postJSON.dropLast()) + friends
        let service = try makeService(json("{\"items\":[\(item)],\"nextCursor\":\"next\"}"))

        let page = try await service.listFriendsReels(cursor: nil)

        #expect(page.nextCursor == "next")
        #expect(page.items.first?.friendInteractionCount == 3)
        let lea = FriendInteraction(
            user: PostAuthor(id: "0199a1b2-5eed-7000-8000-000000000002", username: "lea", avatar: nil),
            kinds: [.liked, .commented],
            commentText: "Top"
        )
        #expect(page.items.first?.friendInteractions == [lea])
    }

    @Test func `amis d’un reel : liste convertie ; reel invisible → postNotFound`() async throws {
        let list = try makeService(json(
            #"{"items":[{"user":{"id":"0199a1b2-5eed-7000-8000-000000000002","username":"lea"},"kinds":["created"]}]}"#
        ))
        #expect(try await list.listReelFriendInteractions(reelId: "reel").map(\.kinds) == [[.created]])

        let missing = try makeService(problem(404, "post_not_found"))
        await #expect(throws: PostServiceError.postNotFound) {
            try await missing.listReelFriendInteractions(reelId: "reel")
        }
    }

    @Test func `fil Reels refuse un curseur invalide`() async throws {
        let service = try makeService(problem(400, "invalid_cursor"))
        await #expect(throws: PostServiceError.invalidCursor) {
            try await service.listReelsFeed(cursor: "invalid")
        }
    }

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
        #expect(post.likeCount == 3)
        #expect(post.isLiked)
        #expect(post.commentCount == 4)
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

    @Test func `feed converti, curseur suivant compris`() async throws {
        let service = try makeService(json(#"{"items":[\#(Self.postJSON)],"nextCursor":"abc"}"#))

        let page = try await service.listFeed(cursor: nil)

        #expect(page.items.map(\.id) == ["0199a1b2-0000-7000-a000-000000000001"])
        #expect(page.nextCursor == "abc")
    }

    @Test func `feed vide, dernière page`() async throws {
        let service = try makeService(json(#"{"items":[]}"#))

        #expect(try await service.listFeed(cursor: "abc") == PostPage(items: [], nextCursor: nil))
    }

    @Test func `feed : curseur invalide (400) → invalidCursor`() async throws {
        let service = try makeService(problem(400, "invalid_cursor"))

        await #expect(throws: PostServiceError.invalidCursor) { try await service.listFeed(cursor: "x") }
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
