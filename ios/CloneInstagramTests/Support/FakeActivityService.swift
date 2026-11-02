import Foundation
@testable import CloneInstagram

/// Faux `ActivityService` : réponses programmables, appels enregistrés.
final class FakeActivityService: ActivityService {
    /// Réponses successives de `fetchActivity` ; page vide quand la liste est vide.
    var fetchResults: [Result<ActivityPage, ActivityServiceError>] = []
    /// Erreurs successives de `markAllRead` ; succès quand la liste est vide.
    var markReadErrors: [ActivityServiceError] = []

    private(set) var fetchCursors: [String?] = []
    private(set) var markReadCount = 0

    func fetchActivity(cursor: String?) async throws(ActivityServiceError) -> ActivityPage {
        fetchCursors.append(cursor)
        guard !fetchResults.isEmpty else { return ActivityPage(items: [], nextCursor: nil, unreadCount: 0) }
        return try fetchResults.removeFirst().get()
    }

    func markAllRead() async throws(ActivityServiceError) {
        markReadCount += 1
        if !markReadErrors.isEmpty {
            throw markReadErrors.removeFirst()
        }
    }
}

extension ActivityGroup {
    static func fixture(
        id: String,
        kind: Kind = .follow,
        username: String = "lea",
        actorCount: Int = 1,
        createdAt: Date = Date(timeIntervalSince1970: 1_790_000_000),
        isRead: Bool = false,
        postId: String? = nil
    ) -> ActivityGroup {
        ActivityGroup(
            id: id,
            kind: kind,
            actor: PostAuthor(id: "actor-\(username)", username: username, avatar: nil),
            actorCount: actorCount,
            createdAt: createdAt,
            isRead: isRead,
            post: postId.flatMap { postId in
                URL(string: "https://cdn.test/t.webp").map { url in
                    ActivityGroup.PostPreview(id: postId, thumbnail: ImageVariants(thumb: url, medium: url, large: url))
                }
            },
            comment: nil
        )
    }
}
