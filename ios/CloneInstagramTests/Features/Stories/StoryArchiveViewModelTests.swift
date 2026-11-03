import Testing
@testable import CloneInstagram

struct StoryArchiveViewModelTests {
    @Test func `archive conserve ses stories après erreur de pagination et permet de réessayer`() async {
        let service = FakeStoryService()
        service.archiveResult = .success(.init(items: [.fixture(id: "old", authorId: "me")], nextCursor: "next"))
        let model = StoryArchiveViewModel(service: service)
        await model.load()
        service.archiveResult = .failure(.unreachable)
        await model.loadMore()
        #expect(model.items.map(\.id) == ["old"])
        #expect(model.errorMessage != nil)
        service.archiveResult = .success(.init(items: [.fixture(id: "older", authorId: "me")], nextCursor: nil))
        await model.loadMore()
        #expect(model.items.map(\.id) == ["old", "older"])
        #expect(!model.hasMore)
    }
}
