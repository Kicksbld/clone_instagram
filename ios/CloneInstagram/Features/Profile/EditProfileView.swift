import PhotosUI
import SwiftUI
import UIKit

/// « Modifier le profil » (wireframe, T3) : photo, nom, nom d'utilisateur, bio.
struct EditProfileView: View {
    @State private var viewModel: EditProfileViewModel
    @State private var isPhotoMenuPresented = false
    @State private var isPickerPresented = false
    @State private var selection: PhotosPickerItem?
    /// Vignette de la photo en cours d'envoi (`pendingPhoto`), décodée une seule fois.
    @State private var pendingThumbnail: UIImage?
    @Environment(\.dismiss) private var dismiss

    init(viewModel: EditProfileViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 12) {
                    avatar
                        .overlay {
                            if viewModel.isUpdatingPhoto {
                                ProgressView()
                            }
                        }
                    Button("Modifier la photo") { isPhotoMenuPresented = true }
                        .disabled(viewModel.isBusy)
                }
                .frame(maxWidth: .infinity)
            }
            Section {
                TextField("Nom", text: $viewModel.fullName)
                    .textContentType(.name)
                TextField("Nom d'utilisateur", text: $viewModel.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Bio", text: $viewModel.bio, axis: .vertical)
                    .lineLimit(1 ... 5)
            } footer: {
                Text("\(viewModel.bio.count)/\(EditProfileViewModel.bioMaxLength)")
            }
            if let errorMessage = viewModel.errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                }
            }
        }
        .navigationTitle("Modifier le profil")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if viewModel.isSaving {
                    ProgressView()
                } else {
                    Button("Terminé") { Task { await viewModel.save() } }
                        .disabled(viewModel.isBusy)
                }
            }
        }
        .confirmationDialog("Modifier la photo", isPresented: $isPhotoMenuPresented, titleVisibility: .hidden) {
            Button("Nouvelle photo de profil") { isPickerPresented = true }
            if viewModel.profile.avatar != nil {
                Button("Supprimer la photo actuelle", role: .destructive) {
                    Task { await viewModel.removePhoto() }
                }
            }
        }
        .photosPicker(isPresented: $isPickerPresented, selection: $selection, matching: .images)
        .onChange(of: viewModel.pendingPhoto) { _, data in
            pendingThumbnail = data.flatMap { UIImage(data: $0)?.preparingThumbnail(of: CGSize(width: 288, height: 288)) }
        }
        .onChange(of: selection) { _, item in
            guard let item else { return }
            selection = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await viewModel.changePhoto(data)
                } else {
                    viewModel.photoLoadFailed()
                }
            }
        }
        .onChange(of: viewModel.didFinish) { _, finished in
            if finished {
                dismiss()
            }
        }
    }

    /// Nouvelle photo affichée dès son choix, pendant l'envoi (ADR-020) ; sinon la photo de l'API.
    @ViewBuilder
    private var avatar: some View {
        if let pendingThumbnail {
            Image(uiImage: pendingThumbnail)
                .resizable()
                .scaledToFill()
                .frame(width: 96, height: 96)
                .clipShape(Circle())
                .accessibilityLabel("Nouvelle photo de profil")
        } else {
            AvatarView(avatar: viewModel.profile.avatar, size: 96)
        }
    }
}
