import Foundation
import Testing
@testable import CloneInstagram

struct FeedViewModelTests {
    private static let viewerId = "0199a1b2-5eed-7000-8000-000000000001"
    private static let otherId = "0199a1b2-5eed-7000-8000-000000000002"
    private static let now = Date(timeIntervalSince1970: 1_790_344_800)
    private static let day: TimeInterval = 24 * 60 * 60

    private let service = FakePostService()
    private let prefetcher = FakeImagePrefetcher()

    private func makeViewModel(onDeleted: @escaping () -> Void = {}) -> FeedViewModel {
        FeedViewModel(
            viewerId: Self.viewerId,
            posts: service,
            prefetcher: prefetcher,
            now: { Self.now },
            onDeleted: onDeleted
        )
    }

    /// Post `number`, publié il y a `ageDays` jours, avec une photo propre à ce post.
    private func post(_ number: Int, ageDays: Double = 0, authorId: String = otherId) -> Post {
        let large = URL(filePath: "/media-public/\(number)/large.webp")
        return Post(
            id: "0199a1b2-0000-7000-a000-\(String(format: "%012d", number))",
            caption: "",
            author: PostAuthor(id: authorId, username: "lea.martin", avatar: nil),
            media: [PostMediaItem(variants: ImageVariants(thumb: large, medium: large, large: large), width: 1080, height: 1350)],
            createdAt: Self.now.addingTimeInterval(-ageDays * Self.day)
        )
    }

    private func page(_ posts: [Post], next: String? = nil) -> Result<PostPage, PostServiceError> {
        .success(PostPage(items: posts, nextCursor: next))
    }

    // MARK: - Chargement et pagination

    @Test func `première page puis suite par curseur, sans doublon`() async {
        let first = (1 ... 12).map { post($0) }
        service.feedResults = [page(first, next: "c1"), page([post(12), post(13)])]
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.loadMore()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.posts.map(\.id) == (first + [post(13)]).map(\.id))
        #expect(service.feedRequests == [nil, "c1"])
        #expect(!viewModel.hasMore)
    }

    @Test func `échec de la suite : feed gardé, « Charger la suite » proposé`() async {
        service.feedResults = [page([post(1)], next: "c1"), .failure(.unreachable)]
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.loadMore()

        #expect(viewModel.posts.map(\.id) == [post(1).id])
        #expect(viewModel.loadMoreFailed)
        #expect(viewModel.hasMore)
    }

    @Test func `échec du premier chargement → failed`() async {
        service.feedResults = [.failure(.unreachable)]
        let viewModel = makeViewModel()

        await viewModel.load()

        guard case .failed = viewModel.state else {
            Issue.record("État attendu : failed")
            return
        }
    }

    @Test func `rafraîchissement en échec : feed gardé`() async {
        service.feedResults = [page([post(1)]), .failure(.unreachable)]
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.refresh()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.posts.map(\.id) == [post(1).id])
    }

    @Test func `revenir sur l'onglet ne recharge pas ; un post supprimé ailleurs recharge`() async {
        service.feedResults = [page([post(1), post(2)]), page([post(2)])]
        let viewModel = makeViewModel()

        await viewModel.appear(revision: 0)
        await viewModel.appear(revision: 0)
        #expect(service.feedRequests.count == 1)

        await viewModel.appear(revision: 1)
        #expect(service.feedRequests.count == 2)
        #expect(viewModel.posts.map(\.id) == [post(2).id])
    }

    @Test func `post qui apparaît : photos des 3 suivants préchargées, suite chargée près du bas`() async {
        let posts = (1 ... 6).map { post($0) }
        service.feedResults = [page(posts, next: "c1"), page([post(7)])]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.postAppeared(posts[0])
        #expect(service.feedRequests == [nil])

        await viewModel.postAppeared(posts[2])
        #expect(service.feedRequests == [nil, "c1"])
        #expect(prefetcher.prefetched.suffix(3) == posts[3 ... 5].map(\.media[0].variants.large))
    }

    @Test func `premier chargement : photos des 3 premiers posts préchargées`() async {
        let posts = (1 ... 5).map { post($0) }
        service.feedResults = [page(posts)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(prefetcher.prefetched == posts.prefix(3).map(\.media[0].variants.large))
    }

    // MARK: - « Vous êtes à jour »

    @Test func `posts récents puis anciens : repère après les récents, anciens repliés`() async {
        service.feedResults = [page([post(1, ageDays: 0.5), post(2, ageDays: 2.9), post(3, ageDays: 4)], next: "c1")]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.recentPosts.map(\.id) == [post(1).id, post(2).id])
        #expect(viewModel.olderPosts.map(\.id) == [post(3).id])
        #expect(viewModel.isCaughtUp)
        #expect(viewModel.canShowOlder)
        #expect(viewModel.visiblePosts.map(\.id) == [post(1).id, post(2).id])
    }

    @Test func `anciens repliés : la suite n'est pas chargée`() async {
        let posts = [post(1, ageDays: 1), post(2, ageDays: 5)]
        service.feedResults = [page(posts, next: "c1")]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.postAppeared(posts[0])

        #expect(service.feedRequests == [nil])
    }

    @Test func `récents pas tous chargés : pas encore de repère, la suite est chargée`() async {
        let recent = (1 ... 3).map { post($0, ageDays: 1) }
        service.feedResults = [page(recent, next: "c1"), page([post(4, ageDays: 1), post(5, ageDays: 6)])]
        let viewModel = makeViewModel()
        await viewModel.load()
        #expect(!viewModel.isCaughtUp)

        await viewModel.postAppeared(recent[2])

        #expect(viewModel.isCaughtUp)
        #expect(viewModel.recentPosts.count == 4)
    }

    @Test func `aucun post récent : repère en tête, anciens à la demande`() async {
        service.feedResults = [page([post(1, ageDays: 10)])]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.recentPosts.isEmpty)
        #expect(viewModel.isCaughtUp)
        #expect(viewModel.visiblePosts.isEmpty)

        await viewModel.showOlder()

        #expect(viewModel.visiblePosts.map(\.id) == [post(1).id])
        #expect(!viewModel.canShowOlder)
    }

    @Test func `tout est récent, fin du feed : repère sans bouton`() async {
        service.feedResults = [page([post(1, ageDays: 1)])]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.isCaughtUp)
        #expect(!viewModel.canShowOlder)
    }

    @Test func `afficher les anciens alors qu'aucun n'est chargé : page suivante chargée`() async {
        service.feedResults = [page([post(1, ageDays: 1)], next: "c1"), page([post(2, ageDays: 8)])]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.showOlder()

        #expect(service.feedRequests == [nil, "c1"])
        #expect(viewModel.visiblePosts.map(\.id) == [post(1).id, post(2).id])
    }

    @Test func `rafraîchir replie les anciens`() async {
        service.feedResults = [page([post(1, ageDays: 1), post(2, ageDays: 8)]), page([post(1, ageDays: 1), post(2, ageDays: 8)])]
        let viewModel = makeViewModel()
        await viewModel.load()
        await viewModel.showOlder()

        await viewModel.refresh()

        #expect(!viewModel.isShowingOlder)
    }

    @Test func `feed vide : ni repère ni bouton`() async {
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.posts.isEmpty)
        #expect(!viewModel.isCaughtUp)
    }

    // MARK: - Suppression

    @Test func `menu « Supprimer » seulement sur mes posts`() {
        let viewModel = makeViewModel()

        #expect(viewModel.canDelete(post(1, authorId: Self.viewerId)))
        #expect(!viewModel.canDelete(post(2)))
    }

    @Test func `supprimer mon post : retiré du feed, profil prévenu, sans rechargement`() async {
        let mine = post(1, authorId: Self.viewerId)
        service.feedResults = [page([mine, post(2)])]
        var deletions = 0
        let viewModel = makeViewModel { deletions += 1 }
        await viewModel.appear(revision: 0)

        await viewModel.delete(mine)
        await viewModel.appear(revision: 1)

        #expect(service.deleted == [mine.id])
        #expect(viewModel.posts.map(\.id) == [post(2).id])
        #expect(deletions == 1)
        #expect(service.feedRequests.count == 1)
    }

    @Test func `post déjà supprimé (404) : succès`() async {
        let mine = post(1, authorId: Self.viewerId)
        service.feedResults = [page([mine])]
        service.deleteErrors = [.postNotFound]
        var deletions = 0
        let viewModel = makeViewModel { deletions += 1 }
        await viewModel.load()

        await viewModel.delete(mine)

        #expect(viewModel.posts.isEmpty)
        #expect(deletions == 1)
    }

    @Test func `échec de la suppression : post gardé, message affiché`() async {
        let mine = post(1, authorId: Self.viewerId)
        service.feedResults = [page([mine])]
        service.deleteErrors = [.unreachable]
        var deletions = 0
        let viewModel = makeViewModel { deletions += 1 }
        await viewModel.load()

        await viewModel.delete(mine)

        #expect(viewModel.posts.map(\.id) == [mine.id])
        #expect(viewModel.deleteErrorMessage != nil)
        #expect(deletions == 0)
        #expect(viewModel.deletingPostId == nil)
    }

    @Test func `post d'un autre : jamais supprimé`() async {
        let viewModel = makeViewModel()

        await viewModel.delete(post(2))

        #expect(service.deleted.isEmpty)
    }
}
