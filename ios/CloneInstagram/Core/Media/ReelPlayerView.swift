import AVFoundation
import NukeUI
import SwiftUI

/// Deux lecteurs réutilisés par l'onglet Reels, le feed et le plein écran ; un seul joue, même lors d'une
/// ouverture successive de reels.
@Observable
final class ReelPlayerPool {
    static let shared = ReelPlayerPool()
    private let players = [AVPlayer(), AVPlayer()]
    private var urls: [URL?] = [nil, nil]
    private var activeIndex: Int?
    /// Vue qui a lancé la lecture en cours : le même reel peut passer du feed au plein écran (même lecteur).
    private var activeOwner: UUID?
    private var preloadObservation: NSKeyValueObservation?

    func play(_ url: URL, reload: Bool = false, owner: UUID = UUID()) -> AVPlayer {
        pause()
        activeOwner = owner
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

    /// Arrêt demandé par une vue : sans effet si une autre vue a repris la lecture depuis.
    func stop(owner: UUID) {
        guard isPlaying(owner: owner) else { return }
        pause()
    }

    func isPlaying(owner: UUID) -> Bool {
        activeOwner == owner
    }

    func pause() {
        activeOwner = nil
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
    @State private var isPaused = false
    /// Identifie cette vue auprès du pool : son arrêt ne coupe pas un reel repris ailleurs.
    @State private var owner = UUID()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                ReelPlayerSurface(player: player, onReady: { isReady = true }, onFailure: { hasFailed = true })
                    .id(ownedItem.map(ObjectIdentifier.init))
                    .ignoresSafeArea()
                    .accessibilityHidden(true)
            }
            // Miniature (Nuke) en attendant la première image, et sous le message d'échec (ADR-024).
            if hasFailed || !isReady {
                LazyImage(url: media.variants.large) { state in
                    if let image = state.image {
                        image.resizable().scaledToFit()
                    } else if !hasFailed {
                        ProgressView().tint(.white)
                    }
                }
            }
            if hasFailed {
                VStack(spacing: 8) {
                    Label("Lecture impossible", systemImage: "wifi.exclamationmark")
                        .font(.headline)
                    Text("Vérifiez votre connexion et réessayez.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                    Button("Réessayer", action: start)
                        .buttonStyle(.borderedProminent)
                }
                .foregroundStyle(.white)
                .padding()
                .background(.black.opacity(0.6), in: .rect(cornerRadius: 12))
                .padding()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(media.accessibilityDescription)
        .overlay(alignment: .bottomLeading) {
            Button(isPaused ? "Reprendre la vidéo" : "Mettre la vidéo en pause", systemImage: isPaused ? "play" : "pause") {
                isPaused.toggle()
                if isPaused {
                    player?.pause()
                } else {
                    player?.play()
                }
            }
            .padding()
        }
        .accessibilityAction(.escape) {
            if showsCloseButton {
                dismiss()
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
                  item === ownedItem, item === player?.currentItem,
                  ReelPlayerPool.shared.isPlaying(owner: owner) else { return }
            player?.seek(to: .zero)
            if !isPaused {
                player?.play()
            }
        }
    }

    private func stop() {
        // Une cellule disparue ne doit pas arrêter un lecteur déjà réutilisé ailleurs.
        if let ownedItem, player?.currentItem === ownedItem {
            ReelPlayerPool.shared.stop(owner: owner)
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
        isPaused = false
        if let url = media.hls {
            player = ReelPlayerPool.shared.play(url, reload: retry, owner: owner)
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
        // Les appuis vont aux gestes SwiftUI (plein écran, double tap) du conteneur.
        view.isUserInteractionEnabled = false
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
