import UIKit

/// Icônes de l'app : avantage Clone Plus de P0, appliqué par l'app seule (ADR-012).
/// `assetName` = nom de l'`appiconset` alternatif (`nil` pour l'icône principale).
enum AppIcon: String, CaseIterable, Identifiable {
    case standard
    case citron
    case rose

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .standard: "Par défaut"
        case .citron: "Citron"
        case .rose: "Rose"
        }
    }

    var assetName: String? {
        switch self {
        case .standard: nil
        case .citron: "AppIcon-Citron"
        case .rose: "AppIcon-Rose"
        }
    }

    init(assetName: String?) {
        self = Self.allCases.first { $0.assetName == assetName } ?? .standard
    }
}

enum AppIconError: Error, Equatable {
    /// Icônes alternatives non prises en charge, ou refus du système.
    case failed
}

protocol AppIconService {
    var current: AppIcon { get }
    func setIcon(_ icon: AppIcon) async throws(AppIconError)
}

/// `AppIconService` sur `UIApplication` (`setAlternateIconName`).
struct SystemAppIconService: AppIconService {
    var current: AppIcon {
        AppIcon(assetName: UIApplication.shared.alternateIconName)
    }

    func setIcon(_ icon: AppIcon) async throws(AppIconError) {
        guard UIApplication.shared.supportsAlternateIcons else { throw .failed }
        guard icon != current else { return }
        do {
            try await UIApplication.shared.setAlternateIconName(icon.assetName)
        } catch {
            throw .failed
        }
    }
}
