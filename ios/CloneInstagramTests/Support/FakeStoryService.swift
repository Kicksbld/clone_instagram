import Foundation
@testable import CloneInstagram

/// Faux `StoryService` : réponses programmées, appels enregistrés.
final class FakeStoryService: StoryService {
    var trayResult: Result<[StoryTrayItem], StoryServiceError> = .success([])
    /// Stories par auteur ; un auteur absent renvoie une liste vide.
    var storiesByAuthor: [String: Result<[Story], StoryServiceError>] = [:]
    var publishError: StoryServiceError?
    var deleteError: StoryServiceError?
    var viewError: StoryServiceError?

    private(set) var published: [(mediaId: String, audience: StoryAudience)] = []
    private(set) var viewed: [String] = []
    private(set) var deleted: [String] = []
    private(set) var trayRequests = 0

    func publish(mediaId: String, audience: StoryAudience) async throws(StoryServiceError) -> Story {
        published.append((mediaId, audience))
        if let publishError {
            throw publishError
        }
        return .fixture(id: "published", authorId: "me", audience: audience)
    }

    func tray() async throws(StoryServiceError) -> [StoryTrayItem] {
        trayRequests += 1
        return try trayResult.get()
    }

    func stories(of userId: String) async throws(StoryServiceError) -> [Story] {
        try (storiesByAuthor[userId] ?? .success([])).get()
    }

    func markViewed(storyId: String) async throws(StoryServiceError) {
        viewed.append(storyId)
        if let viewError {
            throw viewError
        }
    }

    func delete(storyId: String) async throws(StoryServiceError) {
        deleted.append(storyId)
        if let deleteError {
            throw deleteError
        }
    }
}

extension Story {
    static func fixture(
        id: String,
        authorId: String,
        audience: StoryAudience = .everyone,
        isSeen: Bool = false
    ) -> Story {
        Story(
            id: id,
            author: PostAuthor(id: authorId, username: "user_\(authorId)", avatar: nil),
            audience: audience,
            photo: PostMediaItem(variants: .fixture, width: 1080, height: 1920),
            isSeen: isSeen,
            createdAt: Date(timeIntervalSince1970: 1_790_000_000),
            expiresAt: Date(timeIntervalSince1970: 1_790_086_400)
        )
    }
}

extension StoryTrayItem {
    static func fixture(authorId: String, isSeen: Bool = false, closeFriends: Bool = false) -> StoryTrayItem {
        StoryTrayItem(
            author: PostAuthor(id: authorId, username: "user_\(authorId)", avatar: nil),
            isSeen: isSeen,
            hasCloseFriendsStory: closeFriends,
            latestStoryAt: Date(timeIntervalSince1970: 1_790_000_000)
        )
    }
}
