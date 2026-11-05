import SwiftUI
import UIKit

/// Retours courts, réservés au lecteur d’écran. Les alertes système annoncent déjà leurs erreurs.
enum AccessibilityFeedback {
    static func announce(_ message: String) {
        guard UIAccessibility.isVoiceOverRunning, UIApplication.shared.applicationState == .active, !message.isEmpty else { return }
        UIAccessibility.post(notification: .announcement, argument: message)
    }
}

private struct AccessibilityStatus: ViewModifier {
    let message: String

    func body(content: Content) -> some View {
        content.onChange(of: message) { _, value in
            AccessibilityFeedback.announce(value)
        }
    }
}

extension View {
    /// Une annonce par changement pertinent ; aucune modification du focus lors d’un rechargement.
    func accessibilityStatus(_ message: String) -> some View {
        modifier(AccessibilityStatus(message: message))
    }
}
