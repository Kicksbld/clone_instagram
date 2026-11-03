import PhotosUI
import SwiftUI

/// Nouvelle story (wireframe) : photo de la caméra système ou de la photothèque, audience, puis
/// « Partager ». La photo s'affiche entière dans un cadre 9:16, sans outil d'édition (ADR-025).
struct CreateStoryView: View {
    @State private var viewModel: CreateStoryViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selection: PhotosPickerItem?
    @State private var isShowingCamera = false
    @State private var loadFailed = false

    init(viewModel: CreateStoryViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                preview
                Picker("Audience", selection: $viewModel.audience) {
                    Text("Tout le monde").tag(StoryAudience.everyone)
                    Label("Amis proches", systemImage: "star.fill").tag(StoryAudience.closeFriends)
                }
                .pickerStyle(.segmented)
                HStack {
                    PhotosPicker(selection: $selection, matching: .images) {
                        Label("Photothèque", systemImage: "photo.on.rectangle")
                    }
                    Spacer()
                    if SystemPhotoCamera.isAvailable {
                        Button("Caméra", systemImage: "camera") { isShowingCamera = true }
                    }
                }
                .buttonStyle(.bordered)
                if case let .failed(message) = viewModel.state {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding()
            .navigationTitle("Ajouter à votre story")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.state == .sharing {
                        ProgressView()
                    } else {
                        Button(shareTitle) { Task { await viewModel.share() } }
                            .disabled(!viewModel.canShare)
                    }
                }
            }
            .interactiveDismissDisabled(viewModel.state == .sharing)
            .onChange(of: viewModel.state) { _, state in
                if state == .published {
                    dismiss()
                }
            }
            .onChange(of: selection) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        viewModel.select(data)
                    } else {
                        loadFailed = true
                    }
                }
            }
            .sheet(isPresented: $isShowingCamera) {
                SystemPhotoCamera { data in
                    isShowingCamera = false
                    if let data {
                        viewModel.select(data)
                    }
                }
                .ignoresSafeArea()
            }
            .alert("Photo illisible", isPresented: $loadFailed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Cette photo n'a pas pu être ouverte. Choisissez-en une autre.")
            }
        }
    }

    private var shareTitle: String {
        if case .failed = viewModel.state {
            return "Réessayer"
        }
        return "Partager"
    }

    /// Cadre 9:16 de la story.
    private var preview: some View {
        ZStack {
            Rectangle().fill(.quaternary)
            if let data = viewModel.photo, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Label("Choisissez une photo", systemImage: "photo")
                    .foregroundStyle(.secondary)
            }
        }
        .aspectRatio(9 / 16, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .frame(maxHeight: .infinity)
    }
}
