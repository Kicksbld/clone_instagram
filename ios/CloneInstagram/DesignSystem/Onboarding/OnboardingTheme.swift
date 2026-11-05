import SwiftUI

/// Style de l'onboarding, de l'accueil et du paywall (ADR-038, exception à la règle wireframe).
extension Color {
    /// Noir pur : identique au fond des vidéos de la mascotte, qui s'y fondent sans bord visible.
    static let onboardingBackground = Color.black
    /// Surfaces (cartes, champs, puces non choisies).
    static let onboardingSurface = Color.white.opacity(0.08)
    static let onboardingSecondaryText = Color.white.opacity(0.65)
}

extension Font {
    /// Titres : système arrondi, très gras.
    static func onboardingTitle(_ style: Font.TextStyle = .largeTitle) -> Font {
        .system(style, design: .rounded, weight: .heavy)
    }

    static func onboardingBody(_ style: Font.TextStyle = .body, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .rounded, weight: weight)
    }
}

extension View {
    /// Fond noir plein écran, apparence sombre (champs, sélecteurs et barre d'état adaptés). Écran présenté
    /// dans le reste de l'app (paywall des Paramètres) : `forcesWindowScheme: false`, l'apparence sombre ne
    /// s'applique qu'à cet écran.
    @ViewBuilder
    func onboardingScreen(forcesWindowScheme: Bool = true) -> some View {
        let screen = frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.onboardingBackground.ignoresSafeArea())
            .foregroundStyle(.white)
            .environment(\.colorScheme, .dark)
        if forcesWindowScheme {
            screen.preferredColorScheme(.dark)
        } else {
            screen
        }
    }
}
