import Testing
@testable import CloneInstagram

/// Bandeau des stories : ma story à part, ordre de l'API conservé, échec réessayable.
struct StoryTrayViewModelTests {
    private let service = FakeStoryService()
    private let currentUser = PostAuthor(id: "me", username: "moi", avatar: nil)

    @Test func `ma story en tête, puis les autres dans l'ordre de l'API`() async {
        service.trayResult = .success([
            .fixture(authorId: "me", isSeen: true),
            .fixture(authorId: "bruno"),
            .fixture(authorId: "alice", isSeen: true, closeFriends: true),
        ])
        let viewModel = StoryTrayViewModel(currentUser: currentUser, service: service)

        await viewModel.load()

        #expect(viewModel.myItem?.author.id == "me")
        #expect(viewModel.otherItems.map(\.author.id) == ["bruno", "alice"])
        #expect(viewModel.otherItems.last?.hasCloseFriendsStory == true)
    }

    @Test func `échec au premier chargement, puis réessayer ; un échec ensuite garde le bandeau`() async {
        service.trayResult = .failure(.unreachable)
        let viewModel = StoryTrayViewModel(currentUser: currentUser, service: service)
        await viewModel.load()
        #expect(viewModel.state == .failed)

        service.trayResult = .success([.fixture(authorId: "bruno")])
        await viewModel.load()
        #expect(viewModel.state == .loaded)

        service.trayResult = .failure(.unreachable)
        await viewModel.load()
        #expect(viewModel.state == .loaded)
        #expect(viewModel.otherItems.count == 1)
    }
}
