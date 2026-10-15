import Foundation
@testable import CloneInstagram

/// Faux `CommentService` : réponses programmables, appels enregistrés.
final class FakeCommentService: CommentService {
    struct CreateCall: Equatable {
        let body: String
        let parentId: String?
    }

    /// Réponses successives de `listComments` ; page vide quand la liste est vide.
    var listResults: [Result<CommentPage, CommentServiceError>] = []
    /// Réponses successives de `listReplies` ; page vide quand la liste est vide.
    var repliesResults: [Result<CommentPage, CommentServiceError>] = []
    /// Réponses successives de `createComment` ; le commentaire envoyé quand la liste est vide.
    var createResults: [Result<Comment, CommentServiceError>] = []
    /// Erreurs successives de `deleteComment` ; succès quand la liste est vide.
    var deleteErrors: [CommentServiceError] = []
    /// Appelé pendant un envoi, avant la réponse (état optimiste observable).
    var duringCreate: (() -> Void)?

    private(set) var listCursors: [String?] = []
    private(set) var repliesRequests: [(commentId: String, cursor: String?)] = []
    private(set) var created: [CreateCall] = []
    private(set) var deleted: [String] = []

    func listComments(postId _: String, cursor: String?) async throws(CommentServiceError) -> CommentPage {
        listCursors.append(cursor)
        guard !listResults.isEmpty else { return CommentPage(items: [], nextCursor: nil) }
        return try listResults.removeFirst().get()
    }

    func listReplies(commentId: String, cursor: String?) async throws(CommentServiceError) -> CommentPage {
        repliesRequests.append((commentId, cursor))
        guard !repliesResults.isEmpty else { return CommentPage(items: [], nextCursor: nil) }
        return try repliesResults.removeFirst().get()
    }

    func createComment(postId: String, body: String, parentId: String?) async throws(CommentServiceError) -> Comment {
        created.append(CreateCall(body: body, parentId: parentId))
        duringCreate?()
        guard !createResults.isEmpty else {
            return .fixture(id: "created-\(created.count)", postId: postId, parentId: parentId, body: body)
        }
        return try createResults.removeFirst().get()
    }

    func deleteComment(id: String) async throws(CommentServiceError) {
        deleted.append(id)
        if !deleteErrors.isEmpty {
            throw deleteErrors.removeFirst()
        }
    }
}

extension Comment {
    static func fixture(
        id: String,
        postId: String = "0199a1b2-0000-7000-a000-000000000001",
        parentId: String? = nil,
        username: String = "lea",
        body: String = "Super",
        replyCount: Int = 0,
        canDelete: Bool = true
    ) -> Comment {
        Comment(
            id: id,
            postId: postId,
            parentId: parentId,
            author: PostAuthor(id: "author-\(username)", username: username, avatar: nil),
            body: body,
            replyCount: replyCount,
            createdAt: Date(timeIntervalSince1970: 1_790_344_800),
            canDelete: canDelete
        )
    }
}
