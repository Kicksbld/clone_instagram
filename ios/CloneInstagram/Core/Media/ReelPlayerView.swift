import AVFoundation
import NukeUI
import SwiftUI

/// Deux lecteurs réutilisés ; un seul joue, même lors d'une ouverture successive de reels.
@Observable
final class ReelPlayerPool {
    static let shared = ReelPlayerPool()
    private let players = [AVPlayer(), AVPlayer()]
    private var next = 0

    func play(_ url: URL) -> AVPlayer {
        pause()
        let player = players[next]
        next = (next + 1) % players.count
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        player.isMuted = true
        player.play()
        return player
    }

    func pause() {
        for player in players {
            player.pause()
        }
    }
}

struct ReelPlayerView: View {
    let media: PostMediaItem
    @State private var player: AVPlayer?
    @State private var hasFailed = false
    @State private var isReady = false
    @State private var isMuted = true
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                ReelPlayerSurface(player: player, onReady: { isReady = true }, onFailure: { hasFailed = true })
                    .id(ObjectIdentifier(player))
                    .ignoresSafeArea()
            }
            if hasFailed {
                ContentUnavailableView { Label("Lecture impossible", systemImage: "wifi.exclamationmark") }
                    description: { Text("Vérifiez votre connexion et réessayez.") }
                    actions: { Button("Réessayer", action: start) }
                    .foregroundStyle(.white)
            } else if !isReady {
                LazyImage(url: media.variants.large) { state in
                    if let image = state.image {
                        image.resizable().scaledToFit()
                    } else {
                        ProgressView().tint(.white)
                    }
                }
            }
        }
        .overlay(alignment: .topLeading) {
            Button("Fermer", systemImage: "xmark") { dismiss() }.padding()
        }
        .overlay(alignment: .bottomTrailing) {
            Button(isMuted ? "Activer le son" : "Couper le son", systemImage: isMuted ? "speaker.slash" : "speaker.wave.2") {
                isMuted.toggle()
                player?.isMuted = isMuted
            }.padding()
        }
        .onAppear(perform: start)
        .onDisappear { player?.pause(); player = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !hasFailed {
                player?.play()
            } else {
                player?.pause()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            guard let item = notification.object as? AVPlayerItem, item === player?.currentItem else { return }
            player?.seek(to: .zero)
            player?.play()
        }
    }

    private func start() {
        isReady = false
        hasFailed = false
        isMuted = true
        if let url = media.hls {
            player = ReelPlayerPool.shared.play(url)
        } else {
            hasFailed = true
        }
    }
}

private struct ReelPlayerSurface: UIViewRepresentable {
    let player: AVPlayer
    let onReady: () -> Void
    let onFailure: () -> Void
    func makeUIView(context _: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.playerLayer.player = player
        view.ready = onReady
        view.failed = onFailure
        view.startObserving()
        return view
    }

    func updateUIView(_ view: PlayerLayerView, context _: Context) {
        view.playerLayer.player = player
    }
}

private final class PlayerLayerView: UIView {
    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var playerLayer: AVPlayerLayer {
        // layerClass guarantees AVPlayerLayer; avoid a force cast in the view.
        guard let layer = layer as? AVPlayerLayer else { preconditionFailure("AVPlayerLayer required") }
        return layer
    }

    var ready: (() -> Void)?
    var failed: (() -> Void)?
    private var itemObservation: NSKeyValueObservation?
    private var observation: NSKeyValueObservation?
    func startObserving() {
        itemObservation = playerLayer.player?.currentItem?.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            let failed = item.status == .failed
            Task {
                @MainActor [weak self] in if failed {
                    self?.failed?()
                }
            }
        }
        observation = playerLayer.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] layer, _ in
            let ready = layer.isReadyForDisplay
            Task {
                @MainActor [weak self] in if ready {
                    self?.ready?()
                }
            }
        }
    }
}
