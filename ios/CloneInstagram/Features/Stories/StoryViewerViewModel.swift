import Foundation
import Observation

/// Viewer plein écran (ADR-025) : stories des auteurs du bandeau à la suite, 5 secondes chacune, en
/// commençant par la première story non vue de chaque auteur. Le temps et la vue partent à l'affichage de
/// la photo (`photoDidAppear`), pas avant son chargement.
@Observable
final class StoryViewerViewModel {
    enum State: Equatable {
        case loading
        case showing
        case failed(message: String)
        /// Plus rien à montrer : le viewer se ferme.
        case finished
    }

    /// Durée d'affichage d'une story, en secondes.
    static let storyDuration = 5.0

    private(set) var state: State = .loading
    /// Stories actives chargées de l'auteur affiché, de la plus ancienne à la plus récente.
    private var loadedStories: [Story] = []
    private var currentStoryId: String?
    /// Avancement de la story affichée, de 0 à 1.
    private(set) var progress = 0.0
    /// Doigt appuyé ou confirmation de suppression ouverte.
    var isPaused = false
    /// Photo de la story affichée chargée : le temps s'écoule.
    private(set) var isPhotoDisplayed = false

    private let viewerId: String
    private let authors: [PostAuthor]
    private var authorIndex: Int
    private let service: any StoryService
    let deletions: StoryDeletionStore

    init(
        viewerId: String,
        authors: [PostAuthor],
        startIndex: Int,
        service: any StoryService,
        deletions: StoryDeletionStore
    ) {
        self.viewerId = viewerId
        self.authors = authors
        authorIndex = min(max(startIndex, 0), max(authors.count - 1, 0))
        self.service = service
        self.deletions = deletions
    }

    /// Stories de l'auteur affiché, sans celles que je supprime (`StoryDeletionStore`).
    var stories: [Story] {
        deletions.visible(loadedStories)
    }

    /// Position de la story affichée dans `stories`.
    var storyIndex: Int {
        stories.firstIndex { $0.id == currentStoryId } ?? 0
    }

    var author: PostAuthor? {
        authors.indices.contains(authorIndex) ? authors[authorIndex] : nil
    }

    var currentStory: Story? {
        stories.first { $0.id == currentStoryId }
    }

    /// Ma story : menu « Supprimer ».
    var isMine: Bool {
        author?.id == viewerId
    }

    /// Ouverture du viewer, ou « Réessayer » après un échec.
    func start() async {
        await loadAuthor(startAtUnseen: true)
    }

    /// Temps écoulé à l'écran ; la story suivante s'affiche au bout de 5 secondes.
    func advance(by seconds: Double) async {
        guard state == .showing, isPhotoDisplayed, !isPaused else { return }
        progress = min(1, progress + seconds / Self.storyDuration)
        if progress >= 1 {
            await next()
        }
    }

    /// Appui à droite ou fin de la story : story suivante, puis auteur suivant.
    func next() async {
        guard state == .showing else { return }
        if storyIndex + 1 < stories.count {
            await show(storyIndex + 1)
        } else {
            await nextAuthor()
        }
    }

    /// Appui à gauche : story précédente, ou recommence la première.
    func previous() async {
        guard state == .showing else { return }
        if storyIndex > 0 {
            await show(storyIndex - 1)
        } else {
            progress = 0
        }
    }

    /// Supprime ma story affichée (confirmée par l'utilisateur) : elle disparaît tout de suite et la suivante
    /// s'affiche ; elle réapparaît si l'API échoue (ADR-020).
    func deleteCurrent() async {
        guard isMine, let story = currentStory else { return }
        let index = storyIndex
        guard deletions.hide(storyId: story.id) else { return }
        if stories.isEmpty {
            await nextAuthor()
        } else {
            await show(min(index, stories.count - 1))
        }
        await deletions.confirmDeletion(storyId: story.id)
    }

    private func nextAuthor() async {
        guard authorIndex + 1 < authors.count else {
            state = .finished
            return
        }
        authorIndex += 1
        await loadAuthor(startAtUnseen: true)
    }

    /// Stories de l'auteur ; un auteur sans story visible (expirée, supprimée entre-temps) est passé.
    private func loadAuthor(startAtUnseen: Bool) async {
        guard let author else {
            state = .finished
            return
        }
        state = .loading
        do {
            loadedStories = try await service.stories(of: author.id)
        } catch .userNotFound {
            loadedStories = []
        } catch {
            state = .failed(message: "Impossible de charger les stories. Vérifiez votre connexion et réessayez.")
            return
        }
        guard !stories.isEmpty else {
            await nextAuthor()
            return
        }
        state = .showing
        let firstUnseen = startAtUnseen ? stories.firstIndex { !$0.isSeen } : nil
        await show(firstUnseen ?? 0)
    }

    /// Photo de la story chargée et affichée : le temps démarre et la vue est envoyée ; un échec d'envoi
    /// n'interrompt jamais le visionnage.
    func photoDidAppear(storyId: String) async {
        guard let story = currentStory, story.id == storyId, !isPhotoDisplayed else { return }
        isPhotoDisplayed = true
        guard !story.isSeen else { return }
        if let index = loadedStories.firstIndex(where: { $0.id == story.id }) {
            loadedStories[index].isSeen = true
        }
        try? await service.markViewed(storyId: story.id)
    }

    private func show(_ index: Int) async {
        currentStoryId = stories[index].id
        progress = 0
        isPhotoDisplayed = false
    }
}
