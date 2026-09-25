import Foundation

/// URL publiques des variantes WebP d'une image (ADR-008) : `thumb` 150 px, `medium` 640 px, `large` 1080 px.
nonisolated struct ImageVariants: Equatable {
    let thumb: URL
    let medium: URL
    let large: URL

    /// Plus petite variante assez large pour `pixelWidth` pixels à l'écran (ADR-010).
    func url(forPixelWidth pixelWidth: Double) -> URL {
        if pixelWidth <= 150 {
            thumb
        } else if pixelWidth <= 640 {
            medium
        } else {
            large
        }
    }
}
