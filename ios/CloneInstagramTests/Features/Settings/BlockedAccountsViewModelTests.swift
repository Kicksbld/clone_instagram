import Testing
@testable import CloneInstagram

struct BlockedAccountsViewModelTests {
    private let social = FakeSocialService()

    private func makeViewModel() -> (BlockedAccountsViewModel, BlockStore) {
        let store = BlockStore(service: social)
        return (BlockedAccountsViewModel(social: social, blocks: store), store)
    }

    private static let lea = UserSummary.fixture(id: "lea", username: "lea")
    private static let hugo = UserSummary.fixture(id: "hugo", username: "hugo")

    @Test func `liste chargée puis page suivante, sans doublon`() async {
        social.blockListResults = [
            .success(UserPage(items: [Self.lea], nextCursor: "cur")),
            .success(UserPage(items: [Self.lea, Self.hugo], nextCursor: nil)),
        ]
        let (viewModel, _) = makeViewModel()

        await viewModel.load()
        await viewModel.loadMore()

        #expect(viewModel.state == .loaded)
        #expect(social.blockListCursors == [nil, "cur"])
        #expect(viewModel.users.map(\.id) == ["lea", "hugo"])
        #expect(!viewModel.hasMore)
    }

    @Test func `débloquer → la ligne reste avec « Bloquer », comme Instagram ; bloquer à nouveau`() async {
        social.blockListResults = [.success(UserPage(items: [Self.lea], nextCursor: nil))]
        let (viewModel, store) = makeViewModel()
        await viewModel.load()

        await viewModel.toggleBlock(Self.lea)
        #expect(social.unblocks == ["lea"])
        #expect(!viewModel.isBlocked(Self.lea))
        #expect(viewModel.users.map(\.id) == ["lea"])

        await viewModel.toggleBlock(Self.lea)
        #expect(social.blocks == ["lea"])
        #expect(viewModel.isBlocked(Self.lea))
        #expect(store.isBlocked("lea"))
    }

    @Test func `déblocage refusé → toujours bloqué, message`() async {
        social.blockListResults = [.success(UserPage(items: [Self.lea], nextCursor: nil))]
        social.blockErrors = [.unreachable]
        let (viewModel, _) = makeViewModel()
        await viewModel.load()

        await viewModel.toggleBlock(Self.lea)

        #expect(viewModel.isBlocked(Self.lea))
        #expect(viewModel.actionErrorMessage != nil)
    }

    @Test func `échec du premier chargement → failed`() async {
        social.blockListResults = [.failure(.unreachable)]
        let (viewModel, _) = makeViewModel()

        await viewModel.load()

        guard case .failed = viewModel.state else {
            Issue.record("état attendu : failed")
            return
        }
    }
}
