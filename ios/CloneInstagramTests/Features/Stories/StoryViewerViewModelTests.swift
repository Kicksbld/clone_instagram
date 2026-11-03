import Foundation
import Testing
@testable import CloneInstagram

/// Viewer de stories : 5 s par story, première non vue d'abord, vue envoyée à l'affichage, auteur suivant,
/// pause, suppression de ma story.
struct StoryViewerViewModelTests {
    private let service = FakeStoryService()
    private let viewer = "viewer"
    private let alice = PostAuthor(id: "alice", username: "alice", avatar: nil)
    private let bruno = PostAuthor(id: "bruno", username: "bruno", avatar: nil)

    /// La photo de la story courante s'affiche (chargée par Nuke dans l'app).
    private func display(_ viewModel: StoryViewerViewModel) async {
        if let id = viewModel.currentStory?.id {
            await viewModel.photoDidAppear(storyId: id)
        }
    }

    private func makeViewModel(_ authors: [PostAuthor], start: Int = 0) -> StoryViewerViewModel {
        StoryViewerViewModel(
            viewerId: viewer,
            authors: authors,
            startIndex: start,
            service: service,
            deletions: StoryDeletionStore(service: service)
        )
    }

    @Test func `commence à la première story non vue et envoie sa vue`() async {
        service.storiesByAuthor["alice"] = .success([
            .fixture(id: "a1", authorId: "alice", isSeen: true),
            .fixture(id: "a2", authorId: "alice"),
        ])
        let viewModel = makeViewModel([alice])

        await viewModel.start()
        #expect(service.viewed.isEmpty)
        await display(viewModel)

        #expect(viewModel.currentStory?.id == "a2")
        #expect(service.viewed == ["a2"])
    }

    @Test func `au bout de 5 secondes, story suivante puis auteur suivant, puis fermeture`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        service.storiesByAuthor["bruno"] = .success([.fixture(id: "b1", authorId: "bruno")])
        let viewModel = makeViewModel([alice, bruno])
        await viewModel.start()
        await display(viewModel)

        await viewModel.advance(by: 4.9)
        #expect(viewModel.currentStory?.id == "a1")
        await viewModel.advance(by: 0.1)
        #expect(viewModel.currentStory?.id == "b1")
        #expect(viewModel.progress == 0)

        await display(viewModel)
        await viewModel.advance(by: 5)
        #expect(viewModel.state == .finished)
        #expect(service.viewed == ["a1", "b1"])
    }

    @Test func `photo pas encore chargée : le temps ne s'écoule pas`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let viewModel = makeViewModel([alice])
        await viewModel.start()

        await viewModel.advance(by: 10)

        #expect(viewModel.currentStory?.id == "a1")
        #expect(viewModel.progress == 0)
    }

    @Test func `doigt appuyé : le temps ne s'écoule pas`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let viewModel = makeViewModel([alice])
        await viewModel.start()
        await display(viewModel)

        viewModel.isPaused = true
        await viewModel.advance(by: 10)

        #expect(viewModel.currentStory?.id == "a1")
        #expect(viewModel.progress == 0)
    }

    @Test func `appui à gauche : story précédente, sans renvoyer de vue`() async {
        service.storiesByAuthor["alice"] = .success([
            .fixture(id: "a1", authorId: "alice"),
            .fixture(id: "a2", authorId: "alice"),
        ])
        let viewModel = makeViewModel([alice])
        await viewModel.start()
        await display(viewModel)
        await viewModel.next()
        await display(viewModel)

        await viewModel.previous()
        await display(viewModel)

        #expect(viewModel.currentStory?.id == "a1")
        #expect(service.viewed == ["a1", "a2"])
    }

    @Test func `ma story : aucune vue envoyée`() async {
        service.storiesByAuthor[viewer] = .success([.fixture(id: "m1", authorId: viewer, isSeen: true)])
        let viewModel = makeViewModel([PostAuthor(id: viewer, username: "moi", avatar: nil)])

        await viewModel.start()
        await display(viewModel)

        #expect(viewModel.isMine)
        #expect(service.viewed.isEmpty)
    }

    @Test func `échec d'envoi de la vue : le visionnage continue`() async {
        service.viewError = .unreachable
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let viewModel = makeViewModel([alice])

        await viewModel.start()
        await display(viewModel)

        #expect(viewModel.state == .showing)
        #expect(service.viewed == ["a1"])
    }

    @Test func `auteur devenu invisible ou sans story : passé`() async {
        service.storiesByAuthor["alice"] = .failure(.userNotFound)
        service.storiesByAuthor["bruno"] = .success([.fixture(id: "b1", authorId: "bruno")])
        let viewModel = makeViewModel([alice, bruno])

        await viewModel.start()

        #expect(viewModel.currentStory?.id == "b1")
    }

    @Test func `échec de chargement : message, puis réessayer`() async {
        service.storiesByAuthor["alice"] = .failure(.unreachable)
        let viewModel = makeViewModel([alice])
        await viewModel.start()
        guard case .failed = viewModel.state else {
            Issue.record("état attendu : failed")
            return
        }

        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        await viewModel.start()

        #expect(viewModel.currentStory?.id == "a1")
    }

    @Test func `supprimer ma story : la suivante s'affiche pendant l'appel ; un échec la réaffiche`() async {
        service.storiesByAuthor[viewer] = .success([
            .fixture(id: "m1", authorId: viewer, isSeen: true),
            .fixture(id: "m2", authorId: viewer, isSeen: true),
        ])
        let viewModel = makeViewModel([PostAuthor(id: viewer, username: "moi", avatar: nil)])
        await viewModel.start()
        var duringCall: [String]?
        service.duringDelete = { duringCall = viewModel.stories.map(\.id) }
        service.deleteError = .unreachable

        await viewModel.deleteCurrent()

        #expect(duringCall == ["m2"])
        #expect(viewModel.currentStory?.id == "m2")
        #expect(viewModel.stories.map(\.id) == ["m1", "m2"])
        #expect(viewModel.deletions.errorMessage != nil)
    }

    @Test func `supprimer ma dernière story ferme le viewer sans attendre l'API`() async {
        service.storiesByAuthor[viewer] = .success([.fixture(id: "m1", authorId: viewer, isSeen: true)])
        let viewModel = makeViewModel([PostAuthor(id: viewer, username: "moi", avatar: nil)])
        await viewModel.start()
        var stateDuringCall: StoryViewerViewModel.State?
        service.duringDelete = { stateDuringCall = viewModel.state }

        await viewModel.deleteCurrent()

        #expect(stateDuringCall == .finished)
        #expect(service.deleted == ["m1"])
    }
}
