import AVKit
import PhotosUI
import SwiftUI

/// Aperçu de la vidéo choisie (fichier local) : lecture en boucle, son coupé, comme sur Instagram.
struct SelectedVideoPreview: View {
    let url: URL
    @State private var player = AVQueuePlayer()
    @State private var looper: AVPlayerLooper?

    var body: some View {
        VideoPlayer(player: player)
            .accessibilityLabel("Aperçu de la vidéo")
            .onAppear(perform: start)
            .onDisappear { player.pause() }
            .onChange(of: url) { start() }
    }

    private func start() {
        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = true
        player.play()
    }
}

/// Reel : aperçu de la vidéo choisie, puis photothèque ou caméra système.
struct ReelSourcePicker: View {
    let viewModel: CreatePostViewModel
    @Binding var videoSelection: PhotosPickerItem?
    let onFilm: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            if viewModel.isLoadingVideo {
                ProgressView("Chargement de la vidéo…")
            }
            if let url = viewModel.videoURL {
                SelectedVideoPreview(url: url)
                    .aspectRatio(9 / 16, contentMode: .fit)
                    .frame(maxHeight: 420)
            } else if !viewModel.isLoadingVideo {
                Text("Choisissez ou filmez une vidéo de 60 secondes au plus.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            PhotosPicker(
                viewModel.videoURL == nil ? "Choisir une vidéo" : "Choisir une autre vidéo",
                selection: $videoSelection,
                matching: .videos
            )
            if SystemVideoCamera.isAvailable {
                Button("Filmer une vidéo", action: onFilm)
            }
        }
        .padding()
        .frame(maxHeight: .infinity)
    }
}
