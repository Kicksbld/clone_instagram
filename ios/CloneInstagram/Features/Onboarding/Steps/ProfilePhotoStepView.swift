import SwiftUI

/// Page seule en T2 : l'ajout de la photo arrive en T3.
struct ProfilePhotoStepView: View {
    let viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Ajoutez une photo de profil",
            subtitle: "Ajoutez une photo de profil pour que vos amis sachent que c'est vous.",
            primaryTitle: "Ajouter une photo",
            isPrimaryEnabled: false,
            primaryAction: addPhoto
        ) {
            Image(systemName: "person.crop.circle")
                .resizable()
                .scaledToFit()
                .frame(width: 160, height: 160)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
        } secondary: {
            Button("Passer", action: viewModel.skipProfilePhoto)
        }
    }

    /// Choix et envoi de la photo : T3 (bouton désactivé d'ici là).
    private func addPhoto() {}
}
