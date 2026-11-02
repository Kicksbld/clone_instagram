import Foundation
import Observation

/**
 Pastille du cœur de l'Accueil (ADR-026) : nombre de groupes non lus de l'Activité, une instance pour
 l'app. Rechargée par REST au lancement et au retour au premier plan (le temps réel arrive avec T19) ;
 remise à zéro quand l'Activité est ouverte.
 */
@Observable
final class ActivityBadge {
    private(set) var unreadCount = 0

    private let service: any ActivityService

    init(service: any ActivityService) {
        self.service = service
    }

    /// Nombre relu par `GET /v1/activity` ; une erreur laisse le dernier nombre connu (non bloquant).
    func refresh() async {
        guard let page = try? await service.fetchActivity(cursor: nil) else { return }
        unreadCount = page.unreadCount
    }

    /// Activité ouverte et marquée comme lue.
    func cleared() {
        unreadCount = 0
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        unreadCount = 0
    }
}
