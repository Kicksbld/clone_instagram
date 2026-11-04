import Foundation
import Testing
@testable import CloneInstagram

struct ReelsViewModelTests {
    @Test func `charge les reels, puis la page suivante sans doublon`() async {
        let service = FakePostService()
        let first = Post.fixture(id: "first")
        let second = Post.fixture(id: "second")
        service.reelsFeedResults = [
            .success(PostPage(items: [first], nextCursor: "next")),
            .success(PostPage(items: [first, second], nextCursor: nil)),
        ]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: FakeEngagementService()),
            commentCounts: CommentCountStore()
        )
        await model.appear(revision: 0)
        await model.loadMore()
        #expect(model.posts.map(\.id) == ["first", "second"])
        #expect(service.reelsFeedRequests == [nil, "next"])
        #expect(!model.hasMore)
        await model.appear(revision: 0)
        #expect(service.reelsFeedRequests.count == 2)
    }

    @Test func `échec du chargement puis réessai, et rechargement après blocage`() async {
        let service = FakePostService()
        service.reelsFeedResults = [
            .failure(.unreachable),
            .success(PostPage(items: [.fixture()], nextCursor: nil)),
            .success(PostPage(items: [], nextCursor: nil)),
        ]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: FakeEngagementService()),
            commentCounts: CommentCountStore()
        )
        await model.appear(revision: 0)
        #expect(model.state == .failed)
        await model.load()
        #expect(model.state == .loaded)
        #expect(model.posts.count == 1)
        await model.appear(revision: 1)
        #expect(model.posts.isEmpty)
    }

    @Test func `échec de pagination garde les reels et permet de réessayer le même curseur`() async {
        let service = FakePostService()
        let first = Post.fixture(id: "first")
        service.reelsFeedResults = [
            .success(PostPage(items: [first], nextCursor: "next")),
            .failure(.unreachable),
            .success(PostPage(items: [.fixture(id: "second")], nextCursor: nil)),
        ]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: FakeEngagementService()),
            commentCounts: CommentCountStore()
        )
        await model.load()
        await model.selected("first")
        #expect(model.loadMoreFailed)
        #expect(model.posts == [first])
        await model.loadMore()
        #expect(!model.loadMoreFailed)
        #expect(model.posts.map(\.id) == ["first", "second"])
        #expect(service.reelsFeedRequests == [nil, "next", "next"])
    }

    @Test func `échec du like annule son état partagé et affiche une erreur`() async {
        let service = FakePostService()
        let engagement = FakeEngagementService()
        let post = Post.fixture()
        engagement.results = [.failure(.unreachable)]
        let likes = LikeSynchronizer(service: engagement)
        let counts = CommentCountStore()
        let model = ReelsViewModel(posts: service, likes: likes, commentCounts: counts)
        engagement.duringCall = { #expect(model.displayed(post).isLiked) }
        await model.toggleLike(post)
        #expect(!model.displayed(post).isLiked)
        #expect(model.errorMessage != nil)
        counts.adjust(postId: post.id, by: 1, fallback: 0)
        #expect(model.displayed(post).commentCount == 1)
    }

    @Test func `reel devenu invisible lors du like disparaît`() async {
        let service = FakePostService()
        let engagement = FakeEngagementService()
        engagement.results = [.failure(.postNotFound)]
        service.reelsFeedResults = [.success(PostPage(items: [.fixture()], nextCursor: nil))]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: engagement),
            commentCounts: CommentCountStore()
        )
        await model.load()
        await model.toggleLike(.fixture())
        #expect(model.posts.isEmpty)
    }

    @Test func `sous-onglet Amis : première page des amis, puis retour aux Reels`() async {
        let service = FakePostService()
        service.reelsFeedResults = [
            .success(PostPage(items: [.fixture(id: "public")], nextCursor: nil)),
            .success(PostPage(items: [.fixture(id: "public")], nextCursor: nil)),
        ]
        service.friendsReelsResults = [.success(PostPage(items: [.fixture(id: "friend")], nextCursor: "next"))]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: FakeEngagementService()),
            commentCounts: CommentCountStore()
        )
        await model.appear(revision: 0)

        await model.select(.friends)
        #expect(model.tab == .friends)
        #expect(model.posts.map(\.id) == ["friend"])
        #expect(model.hasMore)
        await model.loadMore()
        #expect(service.friendsReelsRequests == [nil, "next"])

        await model.select(.reels)
        #expect(model.posts.map(\.id) == ["public"])
        #expect(service.reelsFeedRequests == [nil, nil])
    }

    @Test func `sous-onglet Amis en échec → réessai sur le même sous-onglet`() async {
        let service = FakePostService()
        service.friendsReelsResults = [.failure(.unreachable), .success(PostPage(items: [.fixture()], nextCursor: nil))]
        let model = ReelsViewModel(
            posts: service,
            likes: LikeSynchronizer(service: FakeEngagementService()),
            commentCounts: CommentCountStore()
        )
        await model.select(.friends)
        #expect(model.state == .failed)
        await model.load()
        #expect(model.state == .loaded)
        #expect(service.friendsReelsRequests == [nil, nil])
    }

    @Test(arguments: [
        ([FriendInteractionKind.liked], 1, "lea a aimé"),
        ([.commented], 1, "lea a commenté"),
        ([.created], 1, "lea a créé"),
        ([.liked, .commented], 1, "lea a interagi"),
        ([.liked], 2, "lea et 1 autre ami ont interagi"),
        ([.liked], 3, "lea et 2 autres amis ont interagi"),
    ])
    func `phrase des amis sur un reel`(kinds: [FriendInteractionKind], count: Int, expected: String) {
        var post = Post.fixture()
        let lea = FriendInteraction(user: PostAuthor(id: "lea", username: "lea", avatar: nil), kinds: kinds, commentText: nil)
        post.friendInteractions = [lea]
        post.friendInteractionCount = count
        #expect(post.friendsSummary() == expected)
        #expect(post.friendsSummary(hiding: ["lea"]) == nil)
        #expect(Post.fixture().friendsSummary() == nil)
    }
}

struct FriendInteractionsViewModelTests {
    private let lea = FriendInteraction(
        user: PostAuthor(id: "lea", username: "lea", avatar: nil), kinds: [.commented], commentText: "Top"
    )

    @Test func `liste des amis chargée, avec le texte du commentaire`() async {
        let service = FakePostService()
        service.friendInteractionsResults = [.success([lea])]
        let model = FriendInteractionsViewModel(reelId: "reel", posts: service)

        await model.load()

        #expect(model.state == .loaded([lea]))
        #expect(service.friendInteractionsRequests == ["reel"])
        #expect(lea.detail == "a commenté : Top")
        let both = FriendInteraction(user: lea.user, kinds: [.liked, .commented], commentText: "Top")
        #expect(both.detail == "a aimé et commenté : Top")
        #expect(FriendInteraction(user: lea.user, kinds: [.created], commentText: nil).detail == "a créé")
    }

    @Test func `échec puis réessai ; reel devenu invisible → indisponible`() async {
        let service = FakePostService()
        service.friendInteractionsResults = [.failure(.unreachable), .failure(.postNotFound)]
        let model = FriendInteractionsViewModel(reelId: "reel", posts: service)

        await model.load()
        #expect(model.state == .failed)
        await model.load()
        #expect(model.state == .unavailable)
    }
}
