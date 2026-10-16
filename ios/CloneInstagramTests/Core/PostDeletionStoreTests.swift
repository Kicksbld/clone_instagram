import Testing
@testable import CloneInstagram

struct PostDeletionStoreTests {
    private let service = FakePostService()
    private let deletions: PostDeletionStore
    private let posts = [Post.fixture(id: "p1"), Post.fixture(id: "p2")]

    init() {
        deletions = PostDeletionStore(service: service)
    }

    @Test func `suppression : post masqué pendant l'appel, puis supprimé`() async {
        var duringCall: [String]?
        service.duringDelete = { duringCall = deletions.visible(posts).map(\.id) }

        await deletions.delete(postId: "p1")

        #expect(duringCall == ["p2"])
        #expect(service.deleted == ["p1"])
        #expect(deletions.visible(posts).map(\.id) == ["p2"])
        #expect(deletions.errorMessage == nil)
    }

    @Test func `échec : post réaffiché, message`() async {
        service.deleteErrors = [.invalidInput]

        await deletions.delete(postId: "p1")

        #expect(deletions.visible(posts).map(\.id) == ["p1", "p2"])
        #expect(deletions.errorMessage == "La publication n'a pas pu être supprimée. Réessayez.")
    }

    @Test func `déjà supprimé (404) : résultat atteint, aucun message`() async {
        service.deleteErrors = [.postNotFound]

        await deletions.delete(postId: "p1")

        #expect(deletions.isDeleted("p1"))
        #expect(deletions.errorMessage == nil)
    }

    @Test func `deuxième demande pendant l'appel : aucun appel de plus`() async {
        service.duringDelete = { await deletions.delete(postId: "p1") }

        await deletions.delete(postId: "p1")

        #expect(service.deleted == ["p1"])
    }

    @Test func `mon compteur de publications baisse tout de suite, jusqu'au rechargement de mon profil`() async {
        var me = Profile.fixture()
        me.postCount = 3
        var duringCall: Int?
        service.duringDelete = { duringCall = deletions.displayed(me: me).postCount }

        await deletions.delete(postId: "p1")
        #expect(duringCall == 2)
        #expect(deletions.displayed(me: me).postCount == 2)

        me.postCount = 2
        deletions.myProfileReloaded()
        #expect(deletions.displayed(me: me).postCount == 2)
    }

    @Test func `échec : compteur de publications rétabli`() async {
        var me = Profile.fixture()
        me.postCount = 3
        service.deleteErrors = [.unreachable]

        await deletions.delete(postId: "p1")

        #expect(deletions.displayed(me: me).postCount == 3)
    }

    @Test func `grille de mon profil : post supprimé retiré tout de suite`() async {
        service.listResults = [.success(PostPage(items: posts, nextCursor: nil))]
        let grid = ProfilePostsViewModel(userId: "me", posts: service, deletions: deletions)
        await grid.load()

        await deletions.delete(postId: "p2")

        #expect(grid.posts.map(\.id) == ["p1"])
    }

    @Test func `déconnexion : plus aucun post masqué`() async {
        await deletions.delete(postId: "p1")

        deletions.reset()

        #expect(deletions.visible(posts).map(\.id) == ["p1", "p2"])
    }
}
