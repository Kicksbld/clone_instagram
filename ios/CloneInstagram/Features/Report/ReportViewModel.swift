import Foundation
import Observation

/**
 Signaler un post, un commentaire ou un compte (`POST /v1/reports`), comme Instagram : liste des motifs,
 envoi immédiat (« Autre chose » demande d'abord des précisions), puis « Merci de nous l'avoir signalé »
 avec la possibilité de bloquer l'auteur.
 */
@Observable
final class ReportViewModel {
    enum Step: Equatable {
        case choosing
        /// Signalement enregistré : écran « Merci ».
        case sent
        /// Contenu supprimé ou devenu invisible (`404`).
        case targetGone
    }

    enum BlockState: Equatable {
        case idle
        case blocking
        case blocked
    }

    /// `maxLength` du contrat.
    static let maxDetailsLength = 500

    private(set) var step: Step = .choosing
    private(set) var isSending = false
    /// Écran des précisions (« Autre chose »).
    var isEnteringDetails = false
    var details = ""
    /// Échec d'un envoi ou d'un blocage, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?
    private(set) var blockState: BlockState

    let route: ReportRoute
    private let service: any ReportService
    private let blocks: BlockStore

    init(route: ReportRoute, service: any ReportService, blocks: BlockStore) {
        self.route = route
        self.service = service
        self.blocks = blocks
        blockState = blocks.isBlocked(route.author.userId) ? .blocked : .idle
    }

    /// Titre de la liste des motifs, selon la cible.
    var question: String {
        switch route.target {
        case .post: "Pourquoi signalez-vous cette publication ?"
        case .comment: "Pourquoi signalez-vous ce commentaire ?"
        case .user: "Pourquoi signalez-vous ce compte ?"
        }
    }

    var trimmedDetails: String {
        details.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var canSendDetails: Bool {
        !trimmedDetails.isEmpty && trimmedDetails.count <= Self.maxDetailsLength && !isSending
    }

    /// Un motif touché : envoyé tout de suite, sauf « Autre chose » qui ouvre les précisions.
    func select(_ reason: ReportReason) async {
        if reason == .other {
            isEnteringDetails = true
        } else {
            await send(reason, details: nil)
        }
    }

    /// « Envoyer » depuis l'écran des précisions.
    func sendDetails() async {
        guard canSendDetails else { return }
        await send(.other, details: trimmedDetails)
    }

    /// « Bloquer @x » depuis l'écran « Merci ».
    func blockAuthor() async {
        guard blockState == .idle else { return }
        blockState = .blocking
        do {
            try await blocks.block(userId: route.author.userId)
            blockState = .blocked
        } catch {
            blockState = .idle
            errorMessage = BlockStore.message(for: error)
        }
    }

    private func send(_ reason: ReportReason, details: String?) async {
        guard !isSending else { return }
        isSending = true
        defer { isSending = false }
        do {
            try await service.report(route.target, reason: reason, details: details)
            step = .sent
        } catch .targetNotFound {
            step = .targetGone
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    static func message(for error: ReportServiceError) -> String {
        switch error {
        case .rateLimited:
            "Vous avez envoyé beaucoup de signalements. Réessayez plus tard."
        case .cannotReportSelf:
            "Vous ne pouvez pas signaler votre propre compte ou contenu."
        case .unreachable:
            "Connexion impossible. Vérifiez votre réseau, puis réessayez."
        default:
            "Le signalement n'a pas pu être envoyé. Réessayez."
        }
    }
}
