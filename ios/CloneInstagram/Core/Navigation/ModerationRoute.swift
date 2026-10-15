import SwiftUI

/// Compte à bloquer, avec le username affiché dans la confirmation.
struct BlockRoute: Hashable, Identifiable {
    let userId: String
    let username: String

    var id: String {
        userId
    }
}

/// Contenu ou compte à signaler, ouvert depuis un post, un commentaire ou un profil, et affiché par la
/// feature Report ; présenté par `App` : une feature n'importe pas une autre (ADR-010).
struct ReportRoute: Hashable, Identifiable {
    enum Target: Hashable {
        case post(id: String)
        case comment(id: String)
        case user(id: String)
    }

    let target: Target
    /// Auteur du contenu, ou compte signalé : l'écran « Merci » propose de le bloquer.
    let author: BlockRoute

    var id: Target {
        target
    }
}

/// Signaler et bloquer depuis `DesignSystem` ou une feature ; `App` présente la feuille de signalement et
/// la confirmation du blocage.
struct ModerationActions {
    let report: (ReportRoute) -> Void
    let block: (BlockRoute) -> Void
}

extension EnvironmentValues {
    /// Absent (`nil`) quand aucun écran parent ne sait présenter le signalement et le blocage.
    @Entry var moderation: ModerationActions?
    /// Comptes bloqués pendant la session (`BlockStore`) : retirés des écrans déjà chargés.
    @Entry var blockedUserIds: Set<String> = []
}
