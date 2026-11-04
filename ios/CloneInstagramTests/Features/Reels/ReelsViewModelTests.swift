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
}
