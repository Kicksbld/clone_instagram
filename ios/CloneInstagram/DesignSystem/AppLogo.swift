import SwiftUI

/// Logo de l'app (bienvenue, connexion, chargement) : `LogoMark`, cadre et flash à la couleur du texte.
struct AppLogo: View {
    var size: CGFloat = 72

    var body: some View {
        LogoMark()
            .frame(width: size, height: size)
            .accessibilityElement()
            .accessibilityLabel("Clone")
            .accessibilityAddTraits(.isImage)
    }
}
