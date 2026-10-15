import Foundation
import Observation

/// Choix de l'icône de l'app, avantage Clone Plus (ADR-012) : réservé au plan `plus` renvoyé par l'API.
@Observable
final class AppIconViewModel {
    private(set) var selected: AppIcon
    var message: String?

    private let service: any AppIconService

    init(service: any AppIconService) {
        self.service = service
        selected = service.current
    }

    func select(_ icon: AppIcon, isPlus: Bool) async {
        guard isPlus, icon != selected else { return }
        do {
            try await service.setIcon(icon)
            selected = icon
        } catch {
            message = "Impossible de changer l'icône de l'app."
        }
    }
}
