import Testing
@testable import CloneInstagram

struct SearchViewModelTests {
    private let social = FakeSocialService()

    @Test func `recherche nettoyée, résultats affichés`() async {
        social.searchResults = [.success([.fixture()])]
        let viewModel = SearchViewModel(social: social)
        viewModel.query = "  @hugo "

        await viewModel.search()

        #expect(social.searches == ["hugo"])
        #expect(viewModel.state == .results([.fixture()]))
    }

    @Test func `champ vide ou « @ » : aucun appel`() async {
        let viewModel = SearchViewModel(social: social)
        viewModel.query = " @ "

        await viewModel.search()

        #expect(social.searches.isEmpty)
        #expect(viewModel.state == .idle)
    }

    @Test func `réponse d'une requête dépassée ignorée`() async {
        social.searchResults = [.success([.fixture()])]
        let viewModel = SearchViewModel(social: social)
        viewModel.query = "hu"
        social.onSearch = { viewModel.query = "hugo" }

        await viewModel.search()

        #expect(social.searches == ["hu"])
        #expect(viewModel.state == .searching)
    }

    @Test func `erreur réseau : message`() async {
        social.searchResults = [.failure(.unreachable)]
        let viewModel = SearchViewModel(social: social)
        viewModel.query = "hugo"

        await viewModel.search()

        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }
    }
}
