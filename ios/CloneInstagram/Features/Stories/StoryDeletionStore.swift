import Foundation
import Observation

/**
 Suppression de mes stories, partagée par le bandeau et le viewer. Mise à jour optimiste sur le moteur commun
 `OptimisticSync` (ADR-020, choix du lead dev en T24) : la story disparaît avant la réponse de l'API et
 réapparaît si elle échoue, avec un message (`errorMessage`, affiché par le viewer s'il est ouvert, sinon par
 le bandeau : le viewer peut s'être fermé après la suppression de ma dernière story).
 */
@Observable
final class StoryDeletionStore {
    /// Stories supprimées (en cours ou confirmées) : masquées.
    private(set) var deletedIds: Set<String> = []
    /// Incrémenté à chaque suppression terminée : le bandeau se recharge.
    private(set) var revision = 0
    /// Échec d'une suppression (story réaffichée), affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?
    @ObservationIgnored private let sync = OptimisticSync<String, Bool>()
    @ObservationIgnored private let service: any StoryService

    init(service: any StoryService) {
        self.service = service
    }

    /// Les stories encore affichées : sans celles que j'ai supprimées.
    func visible(_ stories: [Story]) -> [Story] {
        deletedIds.isEmpty ? stories : stories.filter { !deletedIds.contains($0.id) }
    }

    /// Masque la story tout de suite ; `false` si elle l'était déjà.
    func hide(storyId: String) -> Bool {
        deletedIds.insert(storyId).inserted
    }

    /// `DELETE /v1/stories/{id}` d'une story masquée par `hide` ; déjà supprimée (`404`, réponse perdue d'un
    /// premier essai) = résultat atteint.
    func confirmDeletion(storyId: String) async {
        let outcome = await sync.sync(
            storyId,
            to: true,
            confirmed: false,
            intentOf: { $0 },
            send: { _ throws(StoryServiceError) -> Bool in
                do throws(StoryServiceError) {
                    try await service.delete(storyId: storyId)
                } catch {
                    guard error == .storyNotFound else { throw error }
                }
                return true
            }
        )
        switch outcome {
        case let .failed(error, _, _):
            deletedIds.remove(storyId)
            errorMessage = error == .unreachable
                ? "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
                : "La story n'a pas pu être supprimée. Réessayez."
            revision += 1
        case .confirmed:
            revision += 1
            AccessibilityFeedback.announce("Story supprimée")
        case .pending:
            break
        }
    }
}
