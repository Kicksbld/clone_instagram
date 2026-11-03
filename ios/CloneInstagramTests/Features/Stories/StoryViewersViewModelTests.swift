import Foundation
import Testing
@testable import CloneInstagram

struct StoryViewersViewModelTests {
    @Test func `charge les vues et permet de réessayer après un échec`() async {
        let service = FakeStoryService()
        service.viewersResult = .failure(.unreachable)
        let model = StoryViewersViewModel(storyId: "story", service: service)
        await model.load()
        #expect(model.errorMessage != nil)
        service.viewersResult = .success(.init(items: [
            StoryViewer(account: .init(id: "b", username: "bruno", avatar: nil), fullName: "Bruno", viewedAt: .now),
        ], nextCursor: nil))
        await model.load()
        #expect(model.items.map(\.id) == ["b"])
        #expect(model.errorMessage == nil)
    }

    @Test func `recherche Plus refusée ouvre le paywall sans remplacer les vues`() async {
        let service = FakeStoryService()
        let model = StoryViewersViewModel(storyId: "story", service: service)
        service.viewersResult = .failure(.plusRequired)
        await model.load(query: "bruno")
        #expect(model.needsPlus)
        #expect(model.items.isEmpty)
    }

    @Test func `une recherche échouée ne réutilise pas le curseur de la liste précédente`() async {
        let service = FakeStoryService()
        service.viewersResult = .success(.init(items: [], nextCursor: "old-cursor"))
        let model = StoryViewersViewModel(storyId: "story", service: service)
        await model.load()
        #expect(model.hasMore)
        service.viewersResult = .failure(.unreachable)
        await model.load(query: "bruno")
        #expect(!model.hasMore)
        #expect(model.errorMessage != nil)
        service.viewersResult = .success(.init(items: [], nextCursor: nil))
        await model.load(query: "bruno")
        #expect(model.errorMessage == nil)
    }
}
