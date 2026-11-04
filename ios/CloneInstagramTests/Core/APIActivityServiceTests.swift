import Foundation
import Testing
@testable import CloneInstagram

struct APIActivityServiceTests {
    private func makeService(_ reply: StubTransport.Reply) throws -> APIActivityService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIActivityService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    private static let variants = #"{"thumb":"https://cdn.test/t.webp","medium":"https://cdn.test/m.webp","large":"https://cdn.test/l.webp"}"#

    @Test func `groupes convertis ; type inconnu ignoré (liste ouverte)`() async throws {
        let body = """
        {"items":[\
        {"id":"like:p1","type":"like","actor":{"id":"u1","username":"lea"},"actorCount":2,\
        "createdAt":"2026-09-25T12:00:00.000Z","read":false,"post":{"id":"p1","thumbnail":\(Self.variants)}},\
        {"id":"comment_reply:n2","type":"comment_reply","actor":{"id":"u2","username":"tom"},"actorCount":1,\
        "createdAt":"2026-09-24T12:00:00.000Z","read":true,"post":{"id":"p1","thumbnail":\(Self.variants)},\
        "comment":{"id":"c1","body":"Merci"}},\
        {"id":"future:n3","type":"future","actor":{"id":"u3","username":"ines"},"actorCount":1,\
        "createdAt":"2026-09-23T12:00:00.000Z","read":true},\
        {"id":"follow:n4","type":"follow","actor":{"id":"u3","username":"ines","unknown":true},"actorCount":1,\
        "createdAt":"2026-09-22T12:00:00.000Z","read":true},\
        {"id":"follow_request:n5","type":"follow_request","actor":{"id":"u4","username":"hugo"},"actorCount":1,\
        "createdAt":"2026-09-21T12:00:00.000Z","read":true},\
        {"id":"follow_accepted:n6","type":"follow_accepted","actor":{"id":"u5","username":"prive"},"actorCount":1,\
        "createdAt":"2026-09-20T12:00:00.000Z","read":true}\
        ],"nextCursor":"abc","unreadCount":1}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let page = try await service.fetchActivity(cursor: nil)

        #expect(page.unreadCount == 1)
        #expect(page.nextCursor == "abc")
        #expect(page.items.map(\.kind) == [.like, .commentReply, .follow, .followRequest, .followAccepted])
        let like = try #require(page.items.first)
        #expect(like.actor == PostAuthor(id: "u1", username: "lea", avatar: nil))
        #expect(like.actorCount == 2)
        #expect(!like.isRead)
        #expect(like.post?.id == "p1")
        #expect(like.post?.thumbnail.thumb.absoluteString == "https://cdn.test/t.webp")
        #expect(page.items[1].comment == ActivityGroup.CommentPreview(id: "c1", body: "Merci"))
        #expect(page.items[2].post == nil)
    }

    @Test func `notification de mention décodée avec le post visé`() async throws {
        let body = """
        {"items":[{"id":"mention:n1","type":"mention","actor":{"id":"u1","username":"lea"},"actorCount":1,
        "createdAt":"2026-09-25T12:00:00.000Z","read":false,"post":{"id":"p1","thumbnail":\(Self.variants)}}],"unreadCount":1}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))
        let page = try await service.fetchActivity(cursor: nil)
        #expect(page.items.map(\.kind) == [.mention])
        #expect(page.items.first?.post?.id == "p1")
    }

    @Test func `tout marquer comme lu → 204`() async throws {
        let service = try makeService(.response(status: 204, contentType: nil, body: nil))

        try await service.markAllRead()
    }

    @Test func `curseur invalide, session expirée, réseau coupé`() async throws {
        let invalid = try makeService(problem(400, "invalid_cursor"))
        await #expect(throws: ActivityServiceError.invalidCursor) { try await invalid.fetchActivity(cursor: "x") }
        let expired = try makeService(problem(401, "unauthenticated"))
        await #expect(throws: ActivityServiceError.unauthenticated) { try await expired.markAllRead() }
        let offline = try makeService(.failure)
        await #expect(throws: ActivityServiceError.unreachable) { try await offline.fetchActivity(cursor: nil) }
    }
}
