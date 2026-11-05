import SwiftUI

/// Légende et partage : la publication part dans la file, l'écran se ferme.
struct CaptionView: View {
    let viewModel: CreatePostViewModel
    let onShared: () -> Void

    var body: some View {
        @Bindable var viewModel = viewModel
        Form {
            Section {
                Group {
                    if viewModel.isReel, let url = viewModel.videoURL {
                        SelectedVideoPreview(url: url)
                            .frame(height: 280)
                            .frame(maxWidth: .infinity)
                            .padding()
                    } else {
                        previews
                    }
                }.listRowInsets(EdgeInsets())
                TextField("Ajouter une légende…", text: $viewModel.caption, axis: .vertical)
                    .disabled(viewModel.isSharing)
                    .lineLimit(3 ... 12)
                MentionSuggestions(text: $viewModel.caption)
                    .disabled(viewModel.isSharing)
            }
            Section("Descriptions alternatives") {
                if viewModel.isReel {
                    AltTextField(title: "Description du reel", text: $viewModel.videoAltText)
                        .disabled(viewModel.isSharing)
                } else {
                    ForEach(viewModel.photos.indices, id: \.self) { index in
                        AltTextField(title: "Description de la photo \(index + 1)", text: Binding(
                            get: { viewModel.altText(at: index) },
                            set: { viewModel.setAltText($0, at: index) }
                        ))
                        .disabled(viewModel.isSharing)
                    }
                }
            }
            Section {
                Button {
                    Task {
                        if await viewModel.share() {
                            onShared()
                        }
                    }
                } label: {
                    if viewModel.isSharing {
                        ProgressView().accessibilityLabel("Chargement en cours")
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Partager")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(viewModel.isSharing ? "Préparation de la publication en cours" : "Partager")
                .disabled(viewModel.isSharing)
                .listRowInsets(EdgeInsets())
            }
        }
        .navigationTitle("Nouvelle publication")
        .navigationBarTitleDisplayMode(.inline)
        .alert(
            "Publication impossible",
            isPresented: Binding(
                get: { viewModel.shareErrorMessage != nil },
                set: {
                    if !$0 {
                        viewModel.shareErrorMessage = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.shareErrorMessage ?? "")
        }
    }

    /// Photos recadrées, comme elles seront publiées ; en carrousel quand il y en a plusieurs (Instagram).
    private var previews: some View {
        let images = viewModel.croppedPreviews
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                    Image(image, scale: 1, label: Text(images.count > 1 ? "Photo \(index + 1) sur \(images.count)" : "Photo"))
                        .resizable()
                        .scaledToFit()
                        .frame(height: 280)
                }
            }
            .padding()
        }
        .scrollIndicators(.hidden)
        .frame(maxWidth: .infinity)
    }
}
