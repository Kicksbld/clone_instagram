import AVFoundation
import NukeUI
import SwiftUI

/// Deux lecteurs réutilisés ; un seul joue, même lors d'une ouverture successive de reels.
@Observable
final class ReelPlayerPool {
    static let shared = ReelPlayerPool()
    private let players = [AVPlayer(), AVPlayer()]
    private var urls: [URL?] = [nil, nil]
    private var activeIndex: Int?
    private var preloadObservation: NSKeyValueObservation?

    func play(_ url: URL, reload: Bool = false) -> AVPlayer {
        pause()
        preloadObservation = nil
        let index = urls.firstIndex(of: url) ?? 0
        if reload {
            urls[index] = nil
        }
        prepare(url, at: index)
        activeIndex = index
        let player = players[index]
        player.isMuted = true
        player.play()
        return player
    }

    /// Le suivant charge ses données sans jouer et sans remplacer le reel visible.
    @discardableResult
    func preload(_ url: URL) -> AVPlayer {
        let index = urls.firstIndex(of: url) ?? (activeIndex == 0 ? 1 : 0)
        prepare(url, at: index)
        guard index != activeIndex else { return players[index] }
        // AVPlayer lève une exception Objective-C si preroll précède readyToPlay.
        preloadObservation = players[index].observe(\.status, options: [.initial, .new]) { [weak self] player, _ in
            let ready = player.status == .readyToPlay
            Task { @MainActor [weak self] in
                guard let self, ready, activeIndex != index, urls[index] == url,
                      players[index].status == .readyToPlay else { return }
                players[index].preroll(atRate: 1)
            }
        }
        return players[index]
    }

    private func prepare(_ url: URL, at index: Int) {
        guard urls[index] != url else { return }
        players[index].pause()
        players[index].replaceCurrentItem(with: AVPlayerItem(url: url))
        players[index].isMuted = true
        urls[index] = url
    }

    func pause() {
        for player in players {
            player.pause()
        }
    }
}

struct ReelPlayerView: View {
    let media: PostMediaItem
    var isActive = true
    var showsCloseButton = true
    var nextURL: URL?
    @State private var player: AVPlayer?
    @State private var ownedItem: AVPlayerItem?
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
                    .id(ownedItem.map(ObjectIdentifier.init))
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
            if showsCloseButton {
                Button("Fermer", systemImage: "xmark") { dismiss() }.padding()
            }
        }
        .overlay(alignment: .topTrailing) {
            Button(isMuted ? "Activer le son" : "Couper le son", systemImage: isMuted ? "speaker.slash" : "speaker.wave.2") {
                isMuted.toggle()
                player?.isMuted = isMuted
            }.padding()
        }
        .onAppear(perform: start)
        .onDisappear(perform: stop)
        .onChange(of: isActive) { _, active in
            if active {
                start()
            } else {
                stop()
            }
        }
        .onChange(of: nextURL) { _, url in
            if isActive, let url {
                ReelPlayerPool.shared.preload(url)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, isActive {
                start()
            } else {
                stop()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            guard isActive, scenePhase == .active, let item = notification.object as? AVPlayerItem,
                  item === ownedItem, item === player?.currentItem else { return }
            player?.seek(to: .zero)
            player?.play()
        }
    }

    private func stop() {
        // Une cellule disparue ne doit pas arrêter un lecteur déjà réutilisé ailleurs.
        if let ownedItem, player?.currentItem === ownedItem {
            player?.pause()
        }
        player = nil
        ownedItem = nil
        isReady = false
    }

    private func start() {
        guard isActive, scenePhase == .active else { return }
        let retry = hasFailed
        isReady = false
        hasFailed = false
        isMuted = true
        if let url = media.hls {
            player = ReelPlayerPool.shared.play(url, reload: retry)
            ownedItem = player?.currentItem
            if let nextURL {
                ReelPlayerPool.shared.preload(nextURL)
            }
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
