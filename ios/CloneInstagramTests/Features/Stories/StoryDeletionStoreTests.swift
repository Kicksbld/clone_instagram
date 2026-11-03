import Testing
@testable import CloneInstagram

/// Suppression optimiste de mes stories (ADR-020).
struct StoryDeletionStoreTests {
    private let service = FakeStoryService()
    private let deletions: StoryDeletionStore
    private let stories = [Story.fixture(id: "s1", authorId: "me"), Story.fixture(id: "s2", authorId: "me")]

    init() {
        deletions = StoryDeletionStore(service: service)
    }

    private func delete(_ id: String) async {
        if deletions.hide(storyId: id) {
            await deletions.confirmDeletion(storyId: id)
        }
    }

    @Test func `story masquée pendant l'appel, puis supprimée ; le bandeau est rechargé`() async {
        var duringCall: [String]?
        service.duringDelete = { duringCall = deletions.visible(stories).map(\.id) }

        await delete("s1")

        #expect(duringCall == ["s2"])
        #expect(deletions.visible(stories).map(\.id) == ["s2"])
        #expect(deletions.errorMessage == nil)
        #expect(deletions.revision == 1)
    }

    @Test func `échec : story réaffichée, message`() async {
        service.deleteError = .invalidInput

        await delete("s1")

        #expect(deletions.visible(stories).map(\.id) == ["s1", "s2"])
        #expect(deletions.errorMessage == "La story n'a pas pu être supprimée. Réessayez.")
    }

    @Test func `déjà supprimée (404) : résultat atteint, aucun message`() async {
        service.deleteError = .storyNotFound

        await delete("s1")

        #expect(deletions.visible(stories).map(\.id) == ["s2"])
        #expect(deletions.errorMessage == nil)
    }

    @Test func `deuxième demande pendant l'appel : aucun appel de plus`() async {
        service.duringDelete = { await delete("s1") }

        await delete("s1")

        #expect(service.deleted == ["s1"])
    }
}
