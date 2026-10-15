import Testing
@testable import CloneInstagram

struct CommentCountStoreTests {
    @Test func `nombre partagé : un écran voit le changement fait ailleurs`() {
        let store = CommentCountStore()
        var post = Post.fixture(id: "p1")
        post.commentCount = 2
        store.record([post])

        store.adjust(postId: "p1", by: 1, fallback: 0)

        #expect(store.displayed(post).commentCount == 3)
    }

    @Test func `réponse de l'API : devient le dernier nombre connu`() {
        let store = CommentCountStore()
        var post = Post.fixture(id: "p1")
        store.adjust(postId: "p1", by: 1, fallback: 0)
        post.commentCount = 5

        store.record([post])

        #expect(store.displayed(post).commentCount == 5)
    }

    @Test func `jamais négatif ; vidé à la déconnexion`() {
        let store = CommentCountStore()
        var post = Post.fixture(id: "p1")
        post.commentCount = 1

        store.adjust(postId: "p1", by: -3, fallback: 1)
        #expect(store.displayed(post).commentCount == 0)
        store.reset()
        #expect(store.displayed(post).commentCount == 1)
    }
}
