import Testing
@testable import CloneInstagram

struct CloseFriendsViewModelTests {
    private let social = FakeSocialService()

    private func makeViewModel() -> CloseFriendsViewModel {
        CloseFriendsViewModel(viewerId: "me", social: social)
    }

    private static let lea = UserSummary.fixture(id: "lea", username: "lea")
    private static let hugo = UserSummary.fixture(id: "hugo", username: "hugo")
    private static let viewer = UserSummary.fixture(id: "me", username: "killian")

    private func loaded(_ users: [UserSummary]) async -> CloseFriendsViewModel {
        social.closeFriendListResults = [.success(UserPage(items: users, nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()
        return viewModel
    }

    // MARK: Liste

    @Test func `liste chargée puis page suivante, sans doublon, tous amis proches`() async {
        social.closeFriendListResults = [
            .success(UserPage(items: [Self.lea], nextCursor: "cur")),
            .success(UserPage(items: [Self.lea, Self.hugo], nextCursor: nil)),
        ]
        let viewModel = makeViewModel()

        await viewModel.load()
        await viewModel.loadMore()

        #expect(viewModel.state == .loaded)
        #expect(social.closeFriendListCursors == [nil, "cur"])
        #expect(viewModel.users.map(\.id) == ["lea", "hugo"])
        #expect(viewModel.isCloseFriend(Self.lea) && viewModel.isCloseFriend(Self.hugo))
        #expect(!viewModel.hasMore)
    }

    @Test func `échec du premier chargement → failed, puis réessai`() async {
        social.closeFriendListResults = [.failure(.unreachable), .success(UserPage(items: [Self.lea], nextCursor: nil))]
        let viewModel = makeViewModel()

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("état attendu : failed")
            return
        }
        await viewModel.load()
        #expect(viewModel.state == .loaded)
    }

    // MARK: Ajout et retrait optimistes (ADR-020)

    @Test func `retirer → changé tout de suite, la ligne reste avec « Ajouter » comme Instagram`() async {
        let viewModel = await loaded([Self.lea])
        social.duringCloseFriend = {
            #expect(!viewModel.isCloseFriend(Self.lea))
        }

        await viewModel.toggle(Self.lea)

        #expect(social.removedCloseFriends == ["lea"])
        #expect(!viewModel.isCloseFriend(Self.lea))
        #expect(viewModel.users.map(\.id) == ["lea"])
    }

    @Test func `ajouter depuis la recherche → ami proche tout de suite, en tête de la liste`() async {
        let viewModel = await loaded([Self.lea])
        social.duringCloseFriend = {
            #expect(viewModel.isCloseFriend(Self.hugo))
            #expect(viewModel.users.map(\.id) == ["hugo", "lea"])
        }

        await viewModel.toggle(Self.hugo)

        #expect(social.addedCloseFriends == ["hugo"])
        #expect(viewModel.isCloseFriend(Self.hugo))
        #expect(viewModel.users.map(\.id) == ["hugo", "lea"])
    }

    @Test func `taps rapides : un seul appel en cours, le dernier choix gagne`() async {
        let viewModel = await loaded([Self.lea])
        social.duringCloseFriend = {
            await viewModel.toggle(Self.lea) // ajouté à nouveau pendant le retrait
            await viewModel.toggle(Self.lea) // puis retiré : état voulu = retiré
            await viewModel.toggle(Self.lea) // puis ajouté : état voulu = ajouté
        }

        await viewModel.toggle(Self.lea)

        #expect(social.removedCloseFriends == ["lea"])
        #expect(social.addedCloseFriends == ["lea"])
        #expect(viewModel.isCloseFriend(Self.lea))
    }

    @Test func `échec → retour à l'état confirmé et message`() async {
        let viewModel = await loaded([Self.lea])
        social.closeFriendErrors = [.unreachable]

        await viewModel.toggle(Self.lea)

        #expect(viewModel.isCloseFriend(Self.lea))
        #expect(viewModel.actionErrorMessage == "Connexion impossible. Vérifiez votre réseau, puis réessayez.")
    }

    @Test func `ajout refusé d'un compte ajouté depuis la recherche → retiré de la liste`() async {
        let viewModel = await loaded([Self.lea])
        social.closeFriendErrors = [.unreachable]

        await viewModel.toggle(Self.hugo)

        #expect(!viewModel.isCloseFriend(Self.hugo))
        #expect(viewModel.users.map(\.id) == ["lea"])
    }

    @Test func `compte introuvable (404) → il disparaît de l'écran, avec un message`() async {
        let viewModel = await loaded([Self.lea, Self.hugo])
        social.closeFriendErrors = [.userNotFound]

        await viewModel.toggle(Self.lea)

        #expect(viewModel.users.map(\.id) == ["hugo"])
        #expect(!viewModel.isCloseFriend(Self.lea))
        #expect(viewModel.actionErrorMessage == "Ce compte n'est plus disponible.")
    }

    @Test func `rechargement pendant un appel : l'état voulu n'est pas remplacé`() async {
        social.closeFriendListResults = [
            .success(UserPage(items: [Self.lea], nextCursor: nil)),
            .success(UserPage(items: [Self.lea], nextCursor: nil)),
        ]
        let viewModel = makeViewModel()
        await viewModel.load()
        social.duringCloseFriend = {
            await viewModel.load()
            #expect(!viewModel.isCloseFriend(Self.lea))
        }

        await viewModel.toggle(Self.lea)

        #expect(!viewModel.isCloseFriend(Self.lea))
    }

    // MARK: Recherche

    @Test func `recherche : résultats sans moi-même, avec l'état ami proche`() async {
        let viewModel = await loaded([Self.lea])
        social.searchResults = [.success([Self.viewer, Self.lea, Self.hugo])]
        viewModel.query = "  @h "

        await viewModel.search()

        #expect(social.searches == ["h"])
        #expect(viewModel.searchState == .results([Self.lea, Self.hugo]))
        #expect(viewModel.isCloseFriend(Self.lea))
        #expect(!viewModel.isCloseFriend(Self.hugo))
    }

    @Test func `recherche vide → idle, sans appel`() async {
        let viewModel = await loaded([])
        viewModel.query = "  "

        await viewModel.search()

        #expect(social.searches.isEmpty)
        #expect(viewModel.searchState == .idle)
    }

    @Test func `réponse d'une recherche dépassée ignorée ; échec → message`() async {
        let viewModel = await loaded([])
        social.searchResults = [.success([Self.lea]), .failure(.unreachable)]
        viewModel.query = "le"
        social.onSearch = { viewModel.query = "lea" }

        await viewModel.search()
        #expect(viewModel.searchState == .searching)

        social.onSearch = nil
        await viewModel.search()
        guard case .failed = viewModel.searchState else {
            Issue.record("état attendu : failed")
            return
        }
    }
}
