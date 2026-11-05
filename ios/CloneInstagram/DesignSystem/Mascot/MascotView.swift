import AVFoundation
import SwiftUI

/// Les trois déclinaisons de la mascotte (ADR-038), jamais deux sur le même écran.
enum MascotPose: String, CaseIterable, Sendable {
    /// Appareil photo en bandoulière, salue : narration (accueil, quiz, inscription, notifications).
    case guide
    /// Saute avec un like : faux post liké, paywall.
    case heart
    /// Bras levés sous les confettis : célébrations.
    case bravo

    /// Boucle vidéo muette `Resources/Mascot/mascot-<pose>.mp4` (`ios/scripts/assets/cut-mascots.sh`).
    var videoName: String {
        "mascot-\(rawValue)"
    }

    /// Image fixe de l'asset catalog, affichée si « Réduire les animations » est activé.
    var imageName: String {
        switch self {
        case .guide: "MascotGuide"
        case .heart: "MascotHeart"
        case .bravo: "MascotBravo"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .guide: "\(Mascot.name) te salue"
        case .heart: "\(Mascot.name) saute de joie avec un cœur"
        case .bravo: "\(Mascot.name) célèbre, les bras levés"
        }
    }
}

/// Identité de la mascotte.
enum Mascot {
    static let name = "Lumo"
}

/**
 Mascotte animée en boucle (`AVPlayerLooper`), image fixe tant que la vidéo n'est pas prête et si « Réduire
 les animations » est activé. Vidéo sur fond noir opaque (contours noirs, impossible à détourer) : à poser
 sur un fond noir, comme tout l'onboarding (`Color.onboardingBackground`). Jamais en dessous de ~140 pt de
 large pour rester net (source découpée en 360 px).
 */
struct MascotView: View {
    let pose: MascotPose
    var size: CGFloat = 140
    @State private var isVideoReady = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Image(pose.imageName)
                .resizable()
                .scaledToFit()
                .opacity(isVideoReady && !reduceMotion ? 0 : 1)
            if !reduceMotion, let url = Bundle.main.url(forResource: pose.videoName, withExtension: "mp4") {
                MascotLoop(url: url) { isVideoReady = true }
                    .opacity(isVideoReady ? 1 : 0)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel(pose.accessibilityLabel)
        .accessibilityAddTraits(.isImage)
    }
}

private struct MascotLoop: UIViewRepresentable {
    let url: URL
    let onReady: () -> Void

    func makeUIView(context _: Context) -> MascotPlayerView {
        let view = MascotPlayerView(url: url)
        view.ready = onReady
        view.start()
        return view
    }

    func updateUIView(_: MascotPlayerView, context _: Context) {}

    static func dismantleUIView(_ view: MascotPlayerView, coordinator _: ()) {
        view.stop()
    }
}

private final class MascotPlayerView: UIView {
    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var ready: (() -> Void)?
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var observation: NSKeyValueObservation?

    private var playerLayer: AVPlayerLayer? {
        layer as? AVPlayerLayer
    }

    init(url: URL) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        backgroundColor = .black
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        playerLayer?.player = player
        playerLayer?.videoGravity = .resizeAspect
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    func start() {
        observation = playerLayer?.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] layer, _ in
            guard layer.isReadyForDisplay else { return }
            Task { @MainActor [weak self] in
                self?.ready?()
            }
        }
        player.play()
    }

    func stop() {
        observation = nil
        player.pause()
        looper?.disableLooping()
    }
}
