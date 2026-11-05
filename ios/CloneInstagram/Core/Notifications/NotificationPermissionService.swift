import UserNotifications

/// État de la permission des notifications.
enum NotificationPermissionStatus: Equatable, Sendable {
    /// Jamais demandée : l'écran de pré-permission peut s'afficher.
    case notDetermined
    case granted
    case denied
}

/**
 Permission des notifications (ADR-038), seul accès à `UNUserNotificationCenter`. Demandée après le paywall
 de fin d'onboarding ; aucun jeton n'est encore envoyé à l'API (notifications push : ADR-027).
 */
protocol NotificationPermissionService {
    func status() async -> NotificationPermissionStatus
    /// Demande système ; `false` si refusée ou en cas d'erreur.
    func request() async -> Bool
}

struct SystemNotificationPermissionService: NotificationPermissionService {
    func status() async -> NotificationPermissionStatus {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .notDetermined: .notDetermined
        case .denied: .denied
        default: .granted
        }
    }

    func request() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    }
}

/// Valeur par défaut (tests, previews) : permission déjà décidée, l'écran ne s'affiche pas.
struct DecidedNotificationPermissionService: NotificationPermissionService {
    func status() async -> NotificationPermissionStatus {
        .denied
    }

    func request() async -> Bool {
        false
    }
}
