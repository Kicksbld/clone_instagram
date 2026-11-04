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

    @Test func replyPausesAndRetriesWithTheSameClientId() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        var ids: [String] = []
        var fail = true
        let model = StoryViewerViewModel(
            viewerId: viewer, authors: [alice], startIndex: 0, service: service,
            deletions: StoryDeletionStore(service: service),
            reply: { _, storyId, clientId, body in
                #expect(storyId == "a1")
                #expect(body == "Bonjour")
                ids.append(clientId)
                if fail {
                    throw MessagingError.requestFailed
                }
            }
        )
        await model.start()
        await display(model)
        model.isReplyFocused = true
        model.replyBody = "Bonjour"
        await model.advance(by: 10)
        #expect(model.progress == 0)
        await model.sendReply()
        #expect(model.replyError != nil)
        #expect(model.replyBody == "Bonjour")
        fail = false
        await model.sendReply()
        #expect(ids.count == 2)
        #expect(ids.first == ids.last)
        #expect(model.replyBody.isEmpty)
        #expect(model.replyError == nil)
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

    @Test func `vue anonyme Plus envoyée sans vue normale et préférence refusée aux comptes gratuits`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let model = StoryViewerViewModel(
            viewerId: viewer,
            authors: [alice],
            startIndex: 0,
            service: service,
            deletions: StoryDeletionStore(service: service),
            isPlus: { true }
        )
        model.setAnonymous(true)
        await model.start()
        await display(model)
        #expect(service.anonymousViews == ["a1"])
        #expect(service.viewed.isEmpty)
        let free = makeViewModel([alice])
        free.setAnonymous(true)
        #expect(!free.anonymous)
        #expect(free.needsPlus)
    }

    @Test func `archive ouvre la story sélectionnée sans charger les stories actives ni envoyer de vue`() async {
        let archived = [Story.fixture(id: "old", authorId: viewer), .fixture(id: "older", authorId: viewer)]
        let model = StoryViewerViewModel(
            viewerId: viewer,
            authors: [archived[0].author],
            startIndex: 0,
            service: service,
            deletions: StoryDeletionStore(service: service),
            archivedStories: archived,
            initialStoryId: "older"
        )
        await model.start()
        await display(model)
        #expect(model.currentStory?.id == "older")
        #expect(model.isMine)
        #expect(service.viewed.isEmpty)
        await model.previous()
        #expect(model.currentStory?.id == "old")
    }

    @Test func `abonnement expiré pendant le viewer affiche le paywall et permet de réessayer`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let model = StoryViewerViewModel(
            viewerId: viewer,
            authors: [alice],
            startIndex: 0,
            service: service,
            deletions: StoryDeletionStore(service: service),
            isPlus: { true }
        )
        model.setAnonymous(true)
        await model.start()
        service.viewError = .plusRequired
        await display(model)
        #expect(model.needsPlus)
        #expect(model.viewErrorMessage != nil)
        service.viewError = nil
        model.setAnonymous(false)
        await model.retryView()
        #expect(service.viewed == ["a1"])
        #expect(model.viewErrorMessage == nil)
    }

    @Test func `préférence anonyme conservée après expiration sans révéler de vue normale`() async {
        service.storiesByAuthor["alice"] = .success([.fixture(id: "a1", authorId: "alice")])
        let model = makeViewModel([alice])
        model.restoreAnonymousPreference()
        service.viewError = .plusRequired
        await model.start()
        await display(model)
        #expect(model.anonymous)
        #expect(model.needsPlus)
        #expect(service.viewed.isEmpty)
        #expect(service.anonymousViews == ["a1"])
    }
}
