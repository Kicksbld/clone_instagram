import Testing
@testable import CloneInstagram

struct CommentsViewModelTests {
    private static let postId = "0199a1b2-0000-7000-a000-000000000001"
    private let service = FakeCommentService()
    private let counts = CommentCountStore()

    private func makeViewModel(commentCount: Int = 2) -> CommentsViewModel {
        CommentsViewModel(
            route: CommentsRoute(postId: Self.postId, commentCount: commentCount),
            viewer: PostAuthor(id: "me", username: "killian", avatar: nil),
            service: service,
            counts: counts
        )
    }

    private func count() -> Int {
        counts.count(for: Self.postId, fallback: -1)
    }

    private func page(_ comments: CloneInstagram.Comment..., next: String? = nil) -> Result<CommentPage, CommentServiceError> {
        .success(CommentPage(items: comments, nextCursor: next))
    }

    @Test func `commentaires chargés, du plus récent au plus ancien`() async {
        service.listResults = [page(.fixture(id: "c2"), .fixture(id: "c1"))]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.threads.map(\.id) == ["c2", "c1"])
    }

    @Test func `post supprimé ou invisible → postGone`() async {
        service.listResults = [.failure(.postNotFound)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .postGone)
    }

    @Test func `page suivante à l'approche du bas, sans doublon`() async {
        service.listResults = [
            page(.fixture(id: "c3"), .fixture(id: "c2"), next: "cur"),
            page(.fixture(id: "c2"), .fixture(id: "c1")),
        ]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.commentAppeared(.fixture(id: "c2"))

        #expect(service.listCursors == [nil, "cur"])
        #expect(viewModel.threads.map(\.id) == ["c3", "c2", "c1"])
        #expect(!viewModel.hasMore)
    }

    @Test func `commentaire affiché tout de suite, puis remplacé par la réponse de l'API`() async {
        let viewModel = makeViewModel()
        await viewModel.load()
        viewModel.draft = "  Bravo  "
        service.duringCreate = {
            #expect(viewModel.threads.first?.comment.isPending == true)
            #expect(viewModel.threads.first?.comment.body == "Bravo")
            #expect(viewModel.draft.isEmpty)
        }

        await viewModel.send()

        #expect(service.created == [.init(body: "Bravo", parentId: nil)])
        #expect(viewModel.threads.map(\.id) == ["created-1"])
        #expect(count() == 3)
    }

    @Test func `échec de l'envoi : commentaire retiré, brouillon rendu, compteur revenu`() async {
        service.createResults = [.failure(.rateLimited(retryAfter: 30))]
        let viewModel = makeViewModel()
        await viewModel.load()
        viewModel.draft = "Bravo"

        await viewModel.send()

        #expect(viewModel.threads.isEmpty)
        #expect(viewModel.draft == "Bravo")
        #expect(count() == 2)
        #expect(viewModel.errorMessage?.contains("beaucoup de commentaires") == true)
    }

    @Test func `brouillon vide ou trop long : rien n'est envoyé`() async {
        let viewModel = makeViewModel()
        await viewModel.load()

        viewModel.draft = "   "
        await viewModel.send()
        viewModel.draft = String(repeating: "a", count: 2201)
        await viewModel.send()

        #expect(service.created.isEmpty)
    }

    @Test func `répondre à une réponse vise le commentaire de premier niveau`() async {
        service.listResults = [page(.fixture(id: "c1", replyCount: 1))]
        service.repliesResults = [page(.fixture(id: "r1", parentId: "c1", username: "ines"))]
        let viewModel = makeViewModel()
        await viewModel.load()
        await viewModel.showReplies(of: "c1")

        viewModel.reply(to: .fixture(id: "r1", parentId: "c1", username: "ines"))
        #expect(viewModel.replyTarget == ReplyTarget(parentId: "c1", username: "ines"))
        viewModel.draft = "Merci"
        await viewModel.send()

        #expect(service.created == [.init(body: "Merci", parentId: "c1")])
        #expect(viewModel.replyTarget == nil)
        let thread = viewModel.threads.first
        #expect(thread?.replies.map(\.id) == ["created-1", "r1"])
        #expect(thread?.comment.replyCount == 2)
        #expect(count() == 3)
    }

    @Test func `réponses repliables : afficher, page suivante, masquer`() async {
        service.listResults = [page(.fixture(id: "c1", replyCount: 3))]
        service.repliesResults = [
            page(.fixture(id: "r3", parentId: "c1"), .fixture(id: "r2", parentId: "c1"), next: "rc"),
            page(.fixture(id: "r1", parentId: "c1")),
        ]
        let viewModel = makeViewModel()
        await viewModel.load()
        #expect(viewModel.threads.first?.hiddenReplyCount == 3)

        await viewModel.showReplies(of: "c1")
        #expect(viewModel.threads.first?.hiddenReplyCount == 1)
        await viewModel.showReplies(of: "c1")
        #expect(viewModel.threads.first?.replies.map(\.id) == ["r3", "r2", "r1"])
        #expect(service.repliesRequests.map(\.cursor) == [nil, "rc"])

        viewModel.hideReplies(of: "c1")
        #expect(viewModel.threads.first?.isExpanded == false)
        await viewModel.showReplies(of: "c1")
        #expect(service.repliesRequests.count == 2)
    }

    @Test func `supprimer un commentaire retire ses réponses du compteur`() async {
        service.listResults = [page(.fixture(id: "c1", replyCount: 2), .fixture(id: "c2"))]
        let viewModel = makeViewModel(commentCount: 4)
        await viewModel.load()

        await viewModel.delete(.fixture(id: "c1", replyCount: 2))

        #expect(service.deleted == ["c1"])
        #expect(viewModel.threads.map(\.id) == ["c2"])
        #expect(count() == 1)
    }

    @Test func `supprimer une réponse : reply_count du parent −1`() async {
        service.listResults = [page(.fixture(id: "c1", replyCount: 1))]
        service.repliesResults = [page(.fixture(id: "r1", parentId: "c1"))]
        let viewModel = makeViewModel()
        await viewModel.load()
        await viewModel.showReplies(of: "c1")

        await viewModel.delete(.fixture(id: "r1", parentId: "c1"))

        #expect(viewModel.threads.first?.replies.isEmpty == true)
        #expect(viewModel.threads.first?.comment.replyCount == 0)
        #expect(count() == 1)
    }

    @Test func `suppression déjà faite (404) vaut succès`() async {
        service.listResults = [page(.fixture(id: "c1"))]
        service.deleteErrors = [.commentNotFound]
        let viewModel = makeViewModel(commentCount: 1)
        await viewModel.load()

        await viewModel.delete(.fixture(id: "c1"))

        #expect(viewModel.threads.isEmpty)
        #expect(viewModel.errorMessage == nil)
        #expect(count() == 0)
    }

    @Test func `échec de la suppression : commentaire remis, compteur revenu`() async {
        service.listResults = [page(.fixture(id: "c1"))]
        service.deleteErrors = [.unreachable]
        let viewModel = makeViewModel(commentCount: 1)
        await viewModel.load()

        await viewModel.delete(.fixture(id: "c1"))

        #expect(viewModel.threads.map(\.id) == ["c1"])
        #expect(count() == 1)
        #expect(viewModel.errorMessage != nil)
    }

    @Test func `commentaire d'un autre sur le post d'un autre : pas de suppression`() async {
        service.listResults = [page(.fixture(id: "c1", canDelete: false))]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.delete(.fixture(id: "c1", canDelete: false))

        #expect(service.deleted.isEmpty)
        #expect(viewModel.threads.count == 1)
    }

    @Test func `compte bloqué → ses commentaires et réponses disparaissent`() async {
        service.listResults = [page(.fixture(id: "c2", username: "ines"), .fixture(id: "c1", replyCount: 1))]
        service.repliesResults = [page(.fixture(id: "r1", parentId: "c1", username: "ines"))]
        let viewModel = makeViewModel()
        await viewModel.load()
        await viewModel.showReplies(of: "c1")

        viewModel.hideComments(by: ["author-ines"])

        #expect(viewModel.threads.map(\.id) == ["c1"])
        #expect(viewModel.threads.first?.replies.isEmpty == true)
    }

    @Test func `signaler et bloquer seulement sur les commentaires des autres`() {
        let viewModel = makeViewModel()
        let mine = CloneInstagram.Comment(
            id: "m",
            postId: Self.postId,
            parentId: nil,
            author: PostAuthor(id: "me", username: "killian", avatar: nil),
            body: "Moi",
            replyCount: 0,
            createdAt: .now,
            canDelete: true
        )

        #expect(viewModel.isFromOtherAccount(.fixture(id: "c1")))
        #expect(!viewModel.isFromOtherAccount(mine))
    }
}
