import Foundation
import Testing
@testable import CloneInstagram

/// `APIStoryService` : conversion des DTO et des codes d'erreur (ADR-003).
struct APIStoryServiceTests {
    private func makeService(_ reply: StubTransport.Reply) throws -> APIStoryService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIStoryService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    @Test func `bandeau converti, état vu et amis proches compris`() async throws {
        let body = """
        {"items":[{"author":{"id":"0199a1b2-5eed-7000-8000-000000000001","username":"lea.martin"},\
        "seen":false,"hasCloseFriendsStory":true,"latestStoryAt":"2026-09-25T12:00:00.000Z"}]}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let items = try await service.tray()

        #expect(items.map(\.author.username) == ["lea.martin"])
        #expect(items.first?.isSeen == false)
        #expect(items.first?.hasCloseFriendsStory == true)
    }

    @Test func `story amis proches convertie`() async throws {
        let body = """
        {"items":[{"id":"0199a1b2-0000-7000-e100-000000000001","audience":"close_friends",\
        "author":{"id":"0199a1b2-5eed-7000-8000-000000000001","username":"lea.martin"},\
        "media":{"variants":{"thumb":"http://s/t.webp","medium":"http://s/m.webp","large":"http://s/l.webp"},\
        "width":1080,"height":1920},"viewerHasSeen":true,\
        "createdAt":"2026-09-25T12:00:00.000Z","expiresAt":"2026-09-26T12:00:00.000Z"}]}
        """
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let stories = try await service.stories(of: "0199a1b2-5eed-7000-8000-000000000001")

        #expect(stories.first?.audience == .closeFriends)
        #expect(stories.first?.isSeen == true)
        #expect(stories.first?.photo.height == 1920)
    }

    @Test func `story introuvable (404 story_not_found) → storyNotFound`() async throws {
        let problem = #"{"type":"about:blank","title":"x","status":404,"detail":"x","code":"story_not_found"}"#
        let service = try makeService(.response(status: 404, contentType: "application/problem+json", body: problem))

        await #expect(throws: StoryServiceError.storyNotFound) {
            try await service.markViewed(storyId: "0199a1b2-0000-7000-e100-000000000001")
        }
    }
}
