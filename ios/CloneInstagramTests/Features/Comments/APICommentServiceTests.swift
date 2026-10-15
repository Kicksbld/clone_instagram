import Foundation
import Testing
@testable import CloneInstagram

struct APICommentServiceTests {
    private static let postId = "0199a1b2-0000-7000-a000-000000000001"
    private static let commentJSON = #"""
    {"id":"0199a1b2-0000-7000-b100-000000000002","postId":"0199a1b2-0000-7000-a000-000000000001",
    "parentId":"0199a1b2-0000-7000-b100-000000000001","author":{"id":"0199a1b2-5eed-7000-8000-000000000001",
    "username":"killian"},"body":"Merci","replyCount":0,"createdAt":"2026-09-25T12:00:00.000Z","viewerCanDelete":true}
    """#

    private func makeService(_ reply: StubTransport.Reply) throws -> APICommentService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APICommentService(
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

    @Test func `POST commentaire converti en Comment`() async throws {
        let service = try makeService(json(Self.commentJSON, status: 201))

        let comment = try await service.createComment(
            postId: Self.postId,
            body: "Merci",
            parentId: "0199a1b2-0000-7000-b100-000000000001"
        )

        #expect(comment.id == "0199a1b2-0000-7000-b100-000000000002")
        #expect(comment.parentId == "0199a1b2-0000-7000-b100-000000000001")
        #expect(comment.author.username == "killian")
        #expect(comment.body == "Merci")
        #expect(comment.canDelete)
        #expect(comment.createdAt == Date(timeIntervalSince1970: 1_790_337_600))
    }

    @Test func `GET commentaires converti en page`() async throws {
        let service = try makeService(json(#"{"items":[\#(Self.commentJSON)],"nextCursor":"abc"}"#))

        let page = try await service.listComments(postId: Self.postId, cursor: nil)

        #expect(page.items.map(\.body) == ["Merci"])
        #expect(page.nextCursor == "abc")
    }

    @Test func `DELETE → 204`() async throws {
        let service = try makeService(.response(status: 204, contentType: nil, body: nil))

        try await service.deleteComment(id: "0199a1b2-0000-7000-b100-000000000001")
    }

    @Test(arguments: [
        (404, "post_not_found", CommentServiceError.postNotFound),
        (404, "comment_not_found", .commentNotFound),
        (422, "reply_to_reply", .replyToReply),
        (404, "profile_not_found", .profileNotFound),
        (400, "validation_failed", .invalidInput),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs de publication selon le code`(status: Int, code: String, expected: CommentServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) {
            try await service.createComment(postId: Self.postId, body: "Ok", parentId: nil)
        }
    }

    @Test func `curseur invalide → invalidCursor`() async throws {
        let service = try makeService(problem(400, "invalid_cursor"))

        await #expect(throws: CommentServiceError.invalidCursor) {
            try await service.listReplies(commentId: Self.postId, cursor: "x")
        }
    }

    @Test func `trop de commentaires (429) → rateLimited`() async throws {
        let service = try makeService(problem(429, "rate_limited"))

        await #expect(throws: CommentServiceError.rateLimited(retryAfter: nil)) {
            try await service.createComment(postId: Self.postId, body: "Ok", parentId: nil)
        }
    }

    @Test func `API injoignable → unreachable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: CommentServiceError.unreachable) { try await service.deleteComment(id: Self.postId) }
    }
}
