import Foundation
import Observation

/**
 Pastille du cœur de l'Accueil (ADR-026) : nombre de groupes non lus de l'Activité, une instance pour
 l'app. Rechargée par REST au lancement et au retour au premier plan et après une reconnexion ;
 remise à zéro quand l'Activité est ouverte.
 */
@Observable
final class ActivityBadge {
    private(set) var unreadCount = 0

    private var revision = 0

    private let service: any ActivityService

    init(service: any ActivityService) {
        self.service = service
    }

    /// Nombre relu par `GET /v1/activity` ; une erreur laisse le dernier nombre connu (non bloquant).
    func refresh() async {
        let started = revision
        guard let page = try? await service.fetchActivity(cursor: nil), !Task.isCancelled, started == revision else { return }
        unreadCount = page.unreadCount
    }

    func received(unreadCount: Int) {
        revision += 1
        self.unreadCount = unreadCount
    }

    /// Activité ouverte et marquée comme lue.
    func cleared() {
        revision += 1
        unreadCount = 0
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        revision += 1
        unreadCount = 0
    }
}
