import Testing
@testable import CloneInstagram

struct EditPostViewModelTests {
    private let route = EditPostRoute(postId: "p1", caption: "Avant")

    private func makeViewModel(
        service: FakePostService = FakePostService(),
        edits: PostEditStore = PostEditStore()
    ) -> EditPostViewModel {
        EditPostViewModel(route: route, service: service, edits: edits)
    }

    @Test func `enregistre : attend l'API puis la nouvelle légende s'affiche partout`() async {
        let service = FakePostService()
        var saved = Post.fixture(id: "p1", caption: "Avec @lea")
        saved.mentions = [TextMention(id: "u2", username: "lea", textUsername: "lea", avatar: nil)]
        service.updateCaptionResults = [.success(saved)]
        let edits = PostEditStore()
        let viewModel = makeViewModel(service: service, edits: edits)
        viewModel.caption = "Avec @lea"

        #expect(await viewModel.save())

        #expect(service.captionUpdates.map(\.caption) == ["Avec @lea"])
        let shown = edits.displayed(.fixture(id: "p1", caption: "Avant"))
        #expect(shown.caption == "Avec @lea")
        #expect(shown.mentions == saved.mentions)
        #expect(edits.displayed(.fixture(id: "p2", caption: "Autre")).caption == "Autre")
        #expect(viewModel.errorMessage == nil)
        #expect(!viewModel.isSaving)
    }

    @Test func `échec : message, légende saisie gardée, rien ne change ailleurs ; réessayer fonctionne`() async {
        let service = FakePostService()
        service.updateCaptionResults = [.failure(.unreachable)]
        let edits = PostEditStore()
        let viewModel = makeViewModel(service: service, edits: edits)
        viewModel.caption = "Après"

        #expect(await !viewModel.save())

        #expect(viewModel.errorMessage == "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.")
        #expect(viewModel.caption == "Après")
        #expect(edits.displayed(.fixture(id: "p1", caption: "Avant")).caption == "Avant")

        #expect(await viewModel.save())
        #expect(edits.displayed(.fixture(id: "p1", caption: "Avant")).caption == "Après")
    }

    @Test(arguments: [
        (PostServiceError.postNotFound, "Cette publication n'est plus disponible."),
        (PostServiceError.tooManyMentions, "Vous pouvez mentionner au maximum 20 comptes. Modifiez votre légende et réessayez."),
    ])
    func `erreurs de l'API traduites`(error: PostServiceError, message: String) async {
        let service = FakePostService()
        service.updateCaptionResults = [.failure(error)]
        let viewModel = makeViewModel(service: service)
        viewModel.caption = "Après"

        #expect(await !viewModel.save())
        #expect(viewModel.errorMessage == message)
    }

    @Test func `plus de 20 mentions ou légende trop longue : refusées sans appel à l'API`() async {
        let service = FakePostService()
        let viewModel = makeViewModel(service: service)

        viewModel.caption = (0 ... 20).map { "@user\($0)" }.joined(separator: " ")
        #expect(await !viewModel.save())
        #expect(viewModel.errorMessage == "Vous pouvez mentionner au maximum 20 comptes. Modifiez votre légende et réessayez.")

        viewModel.caption = String(repeating: "a", count: 2201)
        #expect(await !viewModel.save())
        #expect(viewModel.errorMessage == "La légende ne peut pas dépasser 2 200 caractères.")
        #expect(service.captionUpdates.isEmpty)
    }

    @Test func `légende inchangée : rien à enregistrer`() {
        let viewModel = makeViewModel()
        #expect(!viewModel.hasChanges)
        viewModel.caption = "Avant "
        #expect(!viewModel.hasChanges)
        viewModel.caption = "Après"
        #expect(viewModel.hasChanges)
    }

    @Test func `déconnexion : les légendes modifiées sont oubliées`() async {
        let edits = PostEditStore()
        let viewModel = makeViewModel(edits: edits)
        viewModel.caption = "Après"
        _ = await viewModel.save()

        edits.reset()

        #expect(edits.displayed(.fixture(id: "p1", caption: "Avant")).caption == "Avant")
    }
}

struct PostEditStoreTests {
    @Test func `relecture de l'API : la légende du serveur fait foi`() {
        let edits = PostEditStore()
        edits.record(.fixture(id: "p1", caption: "Modifiée ici"))

        edits.refreshed([.fixture(id: "p1", caption: "Modifiée ailleurs")])

        #expect(edits.displayed(.fixture(id: "p1", caption: "Modifiée ailleurs")).caption == "Modifiée ailleurs")
    }
}
