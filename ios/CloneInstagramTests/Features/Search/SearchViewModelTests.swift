import Testing
@testable import CloneInstagram

struct SearchViewModelTests {
    private let social = FakeSocialService()

    @Test func `recherche nettoyée, résultats affichés`() async {
        social.searchResults = [.success([.fixture()])]
        let viewModel = SearchViewModel(social: social, follows: FollowStore(service: social))
        viewModel.query = "  @hugo "

        await viewModel.search()

        #expect(social.searches == ["hugo"])
        #expect(viewModel.state == .results([.fixture()]))
    }

    @Test func `champ vide ou « @ » : aucun appel`() async {
        let viewModel = SearchViewModel(social: social, follows: FollowStore(service: social))
        viewModel.query = " @ "

        await viewModel.search()

        #expect(social.searches.isEmpty)
        #expect(viewModel.state == .idle)
    }

    @Test func `réponse d'une requête dépassée ignorée`() async {
        social.searchResults = [.success([.fixture()])]
        let viewModel = SearchViewModel(social: social, follows: FollowStore(service: social))
        viewModel.query = "hu"
        social.onSearch = { viewModel.query = "hugo" }

        await viewModel.search()

        #expect(social.searches == ["hu"])
        #expect(viewModel.state == .searching)
    }

    @Test func `erreur réseau : message`() async {
        social.searchResults = [.failure(.unreachable)]
        let viewModel = SearchViewModel(social: social, follows: FollowStore(service: social))
        viewModel.query = "hugo"

        await viewModel.search()

        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }
    }

    @Test func `compte bloqué masqué, réaffiché si le blocage échoue`() async {
        social.searchResults = [.success([.fixture(id: "lea"), .fixture(id: "hugo")])]
        let viewModel = SearchViewModel(social: social, follows: FollowStore(service: social))
        viewModel.query = "a"
        await viewModel.search()

        viewModel.hideUsers(["lea"])
        #expect(viewModel.state == .results([.fixture(id: "hugo")]))

        viewModel.hideUsers([])
        #expect(viewModel.state == .results([.fixture(id: "lea"), .fixture(id: "hugo")]))
    }
}
