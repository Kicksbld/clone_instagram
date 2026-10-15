import Foundation
import Observation

/**
 Comptes bloqués pendant la session, partagés par tous les écrans (une instance pour l'app, comme les
 likes) : un compte bloqué depuis un post, un commentaire ou un profil disparaît aussitôt du feed, de la
 recherche, des commentaires et de son profil ouvert (ADR-006). Les écrans relisent l'API ensuite.
 */
@Observable
final class BlockStore {
    /// Comptes bloqués depuis le lancement : retirés des écrans déjà chargés.
    private(set) var blockedIds: Set<String> = []
    /// Incrémenté à chaque blocage : le feed se recharge.
    private(set) var revision = 0
    @ObservationIgnored private let service: any SocialService

    init(service: any SocialService) {
        self.service = service
    }

    func isBlocked(_ userId: String) -> Bool {
        blockedIds.contains(userId)
    }

    /// `PUT /v1/users/{id}/block`, sans mise à jour optimiste : le compte ne disparaît qu'une fois bloqué.
    func block(userId: String) async throws(SocialServiceError) {
        try await service.block(userId: userId)
        blockedIds.insert(userId)
        revision += 1
    }

    /// `DELETE /v1/users/{id}/block` : le compte peut réapparaître dans les écrans rechargés.
    func unblock(userId: String) async throws(SocialServiceError) {
        try await service.unblock(userId: userId)
        blockedIds.remove(userId)
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        blockedIds = []
        revision = 0
    }

    /// Message d'un blocage ou d'un déblocage refusé.
    static func message(for error: SocialServiceError) -> String {
        switch error {
        case .userNotFound:
            "Ce compte n'est plus disponible."
        case .unreachable:
            "Connexion impossible. Vérifiez votre réseau, puis réessayez."
        default:
            "Une erreur est survenue. Réessayez."
        }
    }
}
