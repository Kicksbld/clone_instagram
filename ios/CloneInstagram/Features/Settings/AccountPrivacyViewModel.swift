import Foundation
import Observation

/// Paramètres > Confidentialité du compte (`PATCH /v1/me/settings`) : compte privé ou public, et activité
/// dans l'onglet Amis des Reels (ADR-029), changés tout de suite, sans bloquer les contrôles (optimiste
/// sur `OptimisticSync`, retour arrière et message en cas d'échec, ADR-020). Seul cet écran affiche ces
/// paramètres : pas de store partagé.
@Observable
final class AccountPrivacyViewModel {
    /// Valeur affichée : voulue pendant l'appel, puis confirmée par l'API.
    private(set) var isPrivate: Bool
    /// Qui voit mes J'aime et commentaires dans l'onglet Amis ; voulu pendant l'appel, puis confirmé.
    private(set) var friendsTabActivity: FriendsTabActivity
    /// Échec de l'enregistrement, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    /// Dernière valeur confirmée par l'API.
    private var confirmedIsPrivate: Bool
    private var confirmedFriendsTabActivity: FriendsTabActivity
    private let sync = OptimisticSync<String, Bool>()
    private let activitySync = OptimisticSync<String, FriendsTabActivity>()
    private let identity: any IdentityService
    /// Profil renvoyé par l'API : mon profil est mis à jour partout.
    private let onUpdated: (Profile) -> Void

    init(
        isPrivate: Bool,
        friendsTabActivity: FriendsTabActivity = .mutuals,
        identity: any IdentityService,
        onUpdated: @escaping (Profile) -> Void = { _ in }
    ) {
        self.isPrivate = isPrivate
        confirmedIsPrivate = isPrivate
        self.friendsTabActivity = friendsTabActivity
        confirmedFriendsTabActivity = friendsTabActivity
        self.identity = identity
        self.onUpdated = onUpdated
    }

    func setPrivate(_ isPrivate: Bool) async {
        guard isPrivate != self.isPrivate else { return }
        self.isPrivate = isPrivate

        var updated: Profile?
        let outcome = await sync.sync(
            "isPrivate",
            to: isPrivate,
            confirmed: confirmedIsPrivate,
            intentOf: { $0 }
        ) { wanted throws(IdentityServiceError) -> Bool in
            let profile = try await identity.updateSettings(isPrivate: wanted)
            updated = profile
            return profile.isPrivate
        }
        if let updated {
            confirmedIsPrivate = updated.isPrivate
            onUpdated(updated)
        }
        switch outcome {
        case .pending:
            break
        case let .confirmed(value):
            self.isPrivate = value
            AccessibilityFeedback.announce(value ? "Compte privé" : "Compte public")
        case let .failed(error, _, confirmed):
            self.isPrivate = confirmed
            errorMessage = Self.message(for: error)
        }
    }

    func setFriendsTabActivity(_ activity: FriendsTabActivity) async {
        guard activity != friendsTabActivity else { return }
        friendsTabActivity = activity

        var updated: Profile?
        let outcome = await activitySync.sync(
            "friendsTabActivity",
            to: activity,
            confirmed: confirmedFriendsTabActivity,
            intentOf: { $0 },
            send: { wanted throws(IdentityServiceError) -> FriendsTabActivity in
                let profile = try await identity.updateFriendsTabActivity(wanted)
                updated = profile
                return profile.friendsTabActivity
            }
        )
        if let updated {
            confirmedFriendsTabActivity = updated.friendsTabActivity
            onUpdated(updated)
        }
        switch outcome {
        case .pending:
            break
        case let .confirmed(value):
            friendsTabActivity = value
            AccessibilityFeedback.announce("Visibilité de votre activité mise à jour")
        case let .failed(error, _, confirmed):
            friendsTabActivity = confirmed
            errorMessage = Self.message(for: error)
        }
    }

    private static func message(for error: IdentityServiceError) -> String {
        error == .unreachable
            ? "Connexion impossible. Vérifiez votre réseau, puis réessayez."
            : "Le paramètre n'a pas pu être modifié. Réessayez."
    }
}
