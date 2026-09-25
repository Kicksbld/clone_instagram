import PhotosUI
import SwiftUI

/// Étape photo (passable) : choix dans la photothèque, envoi et traitement avant l'étape bio (T3).
struct ProfilePhotoStepView: View {
    let viewModel: OnboardingViewModel
    @State private var isPickerPresented = false
    @State private var selection: PhotosPickerItem?

    var body: some View {
        OnboardingStepLayout(
            title: "Ajoutez une photo de profil",
            subtitle: "Ajoutez une photo de profil pour que vos amis sachent que c'est vous.",
            primaryTitle: "Ajouter une photo",
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: choosePhoto
        ) {
            AvatarView(avatar: viewModel.profile?.avatar, size: 160)
                .frame(maxWidth: .infinity)
        } secondary: {
            Button("Passer", action: viewModel.skipProfilePhoto)
                .disabled(viewModel.isLoading)
        }
        .photosPicker(isPresented: $isPickerPresented, selection: $selection, matching: .images)
        .onChange(of: selection) { _, item in
            guard let item else { return }
            selection = nil
            Task {
                // Données d'origine (HEIC, JPEG…) : l'UploadManager les convertit et retire les métadonnées.
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await viewModel.addProfilePhoto(data)
                } else {
                    viewModel.profilePhotoLoadFailed()
                }
            }
        }
    }

    private func choosePhoto() {
        isPickerPresented = true
    }
}
