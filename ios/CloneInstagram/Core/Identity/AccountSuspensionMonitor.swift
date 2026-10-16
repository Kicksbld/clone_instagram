import Foundation
import Observation

/// Compte suspendu ou banni en cours de session (ADR-005) : toute route renvoie `403 account_suspended`,
/// sauf `GET /v1/me`. Signalé par `AccountSuspensionMiddleware` ; `App/RootView` relit alors `GET /v1/me`
/// et affiche l'écran « Compte suspendu ».
@Observable
final class AccountSuspensionMonitor {
    /// Incrémenté à chaque refus `account_suspended`.
    private(set) var revision = 0

    func report() {
        revision += 1
    }
}
