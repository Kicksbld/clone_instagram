import Foundation
import Observation

/// Issue d'un blocage ou d'un déblocage, pour l'écran qui l'a demandé.
enum BlockOutcome: Equatable {
    /// L'API a confirmé l'état.
    case confirmed
    /// Échec : retour au dernier état confirmé, message à afficher.
    case reverted(message: String)
}

/**
 Comptes bloqués, partagés par tous les écrans (une instance pour l'app, comme les likes) : un compte bloqué
 depuis un post, un commentaire ou un profil disparaît aussitôt du feed, de la recherche, des commentaires et
 de son profil ouvert (ADR-006). Les écrans relisent l'API ensuite.

 Mise à jour optimiste sur le moteur commun `OptimisticSync` (ADR-020) : le compte disparaît tout de suite,
 avant la réponse de l'API, et réapparaît si elle échoue ; un changement pendant un appel ne change que l'état
 voulu (le dernier choix gagne).
 */
@Observable
final class BlockStore {
    /// Comptes bloqués connus (bloqués pendant la session ou lus dans Paramètres > Comptes bloqués) :
    /// retirés des écrans déjà chargés.
    private(set) var blockedIds: Set<String> = []
    /// Incrémenté à la fin de chaque blocage, réussi ou non : le feed et mes compteurs se rechargent
    /// (abonnements supprimés dans les deux sens, ou contenus à réafficher).
    private(set) var revision = 0
    /// Blocage voulu par compte, un seul appel en cours par compte.
    @ObservationIgnored private let sync = OptimisticSync<String, Bool>()
    @ObservationIgnored private let service: any SocialService

    init(service: any SocialService) {
        self.service = service
    }

    func isBlocked(_ userId: String) -> Bool {
        blockedIds.contains(userId)
    }

    /// Comptes bloqués reçus de l'API (`GET /v1/me/blocks`) : bloqués, sauf pendant un changement en cours.
    func record(blocked users: [UserSummary]) {
        for user in users where !sync.isSyncing(user.id) {
            blockedIds.insert(user.id)
        }
    }

    /// `PUT /v1/users/{id}/block`.
    @discardableResult
    func block(userId: String) async -> BlockOutcome? {
        await setBlocked(true, userId: userId)
    }

    /// `DELETE /v1/users/{id}/block` : le compte peut réapparaître dans les écrans rechargés.
    @discardableResult
    func unblock(userId: String) async -> BlockOutcome? {
        await setBlocked(false, userId: userId)
    }

    /// Déconnexion : rien n'est gardé pour le compte suivant.
    func reset() {
        blockedIds = []
        revision = 0
        sync.reset()
    }

    /**
     `nil` si rien n'a été envoyé : état déjà voulu, ou appel déjà en cours (c'est lui qui enverra le nouvel
     état et rendra l'issue à l'écran qui l'a lancé).
     */
    private func setBlocked(_ blocked: Bool, userId: String) async -> BlockOutcome? {
        let shown = isBlocked(userId)
        guard shown != blocked else { return nil }
        apply(blocked, to: userId)

        let outcome = await sync.sync(
            userId,
            to: blocked,
            confirmed: shown,
            intentOf: { $0 }
        ) { wanted throws(SocialServiceError) -> Bool in
            if wanted {
                try await service.block(userId: userId)
            } else {
                try await service.unblock(userId: userId)
            }
            return wanted
        }
        switch outcome {
        case .pending:
            return nil
        case let .confirmed(isNowBlocked):
            apply(isNowBlocked, to: userId)
            reloadAfterBlockAttempt(wasBlocked: shown)
            return .confirmed
        case let .failed(error, _, confirmed):
            apply(confirmed, to: userId)
            reloadAfterBlockAttempt(wasBlocked: shown)
            return .reverted(message: Self.message(for: error))
        }
    }

    /// Un blocage tenté : le feed et mes compteurs se rechargent, que le compte soit bloqué (abonnements
    /// supprimés) ou réaffiché (échec). Un déblocage ne recharge rien.
    private func reloadAfterBlockAttempt(wasBlocked: Bool) {
        if !wasBlocked {
            revision += 1
        }
    }

    private func apply(_ blocked: Bool, to userId: String) {
        if blocked {
            blockedIds.insert(userId)
        } else {
            blockedIds.remove(userId)
        }
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
