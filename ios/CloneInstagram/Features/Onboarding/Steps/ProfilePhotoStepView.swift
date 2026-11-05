import PhotosUI
import SwiftUI
import UIKit

/// Étape photo (passable) : photo du hook proposée si elle existe (ADR-038), sinon choix dans la photothèque ;
/// envoi et traitement avant l'étape bio (T3).
struct ProfilePhotoStepView: View {
    let viewModel: OnboardingViewModel
    @State private var isPickerPresented = false
    @State private var selection: PhotosPickerItem?
    @State private var hookImage: UIImage?

    private var hasHookPhoto: Bool {
        viewModel.hookResult.photo != nil && viewModel.profile?.avatar == nil
    }

    var body: some View {
        OnboardingStepLayout(
            title: "Ajoutez une photo de profil",
            subtitle: hasHookPhoto
                ? "On reprend la photo que vous venez de publier ?"
                : "Ajoutez une photo de profil pour que vos amis sachent que c'est vous.",
            primaryTitle: hasHookPhoto ? "Utiliser cette photo" : "Ajouter une photo",
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: primaryAction
        ) {
            Group {
                if hasHookPhoto, let hookImage {
                    Image(uiImage: hookImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 160, height: 160)
                        .clipShape(.circle)
                        .overlay { Circle().strokeBorder(Color.cloneLime, lineWidth: 4) }
                        .accessibilityLabel("Photo publiée pendant la découverte")
                } else {
                    AvatarView(avatar: viewModel.profile?.avatar, size: 160)
                }
            }
            .frame(maxWidth: .infinity)
        } secondary: {
            VStack(spacing: 0) {
                if hasHookPhoto {
                    Button("Choisir une autre photo", action: choosePhoto)
                }
                Button("Passer", action: viewModel.skipProfilePhoto)
            }
            .disabled(viewModel.isLoading)
        }
        .task {
            guard let data = viewModel.hookResult.photo, let image = UIImage(data: data) else { return }
            let side = 480 / max(image.size.width, image.size.height, 1)
            let size = CGSize(width: image.size.width * side, height: image.size.height * side)
            hookImage = await image.byPreparingThumbnail(ofSize: size)
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

    private func primaryAction() async {
        if hasHookPhoto {
            await viewModel.useHookPhoto()
        } else {
            choosePhoto()
        }
    }

    private func choosePhoto() {
        isPickerPresented = true
    }
}
