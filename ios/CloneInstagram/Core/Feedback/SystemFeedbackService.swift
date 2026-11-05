import AVFoundation
import Observation
import UIKit

/**
 `FeedbackService` sur AVFoundation et les générateurs haptiques d'UIKit (ADR-038). Session audio `ambient` :
 le bouton silencieux coupe les sons et la musique d'une autre app continue. Sons chargés à la première
 lecture puis gardés en mémoire (moins de 400 Ko au total).
 */
@Observable
final class SystemFeedbackService: FeedbackService {
    static let mutedKey = "feedback.isMuted"

    var isMuted: Bool {
        didSet { defaults.set(isMuted, forKey: Self.mutedKey) }
    }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let bundle: Bundle
    @ObservationIgnored private var players: [FeedbackCue: AVAudioPlayer] = [:]
    @ObservationIgnored private var isSessionReady = false
    @ObservationIgnored private let light = UIImpactFeedbackGenerator(style: .light)
    @ObservationIgnored private let soft = UIImpactFeedbackGenerator(style: .soft)
    @ObservationIgnored private let medium = UIImpactFeedbackGenerator(style: .medium)
    @ObservationIgnored private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    @ObservationIgnored private let selection = UISelectionFeedbackGenerator()
    @ObservationIgnored private let notification = UINotificationFeedbackGenerator()

    init(defaults: UserDefaults = .standard, bundle: Bundle = .main) {
        self.defaults = defaults
        self.bundle = bundle
        isMuted = defaults.bool(forKey: Self.mutedKey)
    }

    func play(_ cue: FeedbackCue) {
        vibrate(for: cue)
        guard !isMuted, let player = player(for: cue) else { return }
        player.currentTime = 0
        player.play()
    }

    private func vibrate(for cue: FeedbackCue) {
        switch cue {
        case .tap, .chime: light.impactOccurred()
        case .tick, .swipe: selection.selectionChanged()
        case .blip: soft.impactOccurred(intensity: 0.4)
        case .pop: soft.impactOccurred()
        case .like: medium.impactOccurred()
        case .shutter: rigid.impactOccurred()
        case .success: notification.notificationOccurred(.success)
        case .error: notification.notificationOccurred(.error)
        case .whoosh: break
        }
    }

    private func player(for cue: FeedbackCue) -> AVAudioPlayer? {
        if let player = players[cue] {
            return player
        }
        prepareSession()
        guard let url = bundle.url(forResource: cue.soundName, withExtension: "caf"),
              let player = try? AVAudioPlayer(contentsOf: url)
        else { return nil }
        player.prepareToPlay()
        players[cue] = player
        return player
    }

    /// Une fois : `ambient` (mode silencieux respecté, mélangé aux autres apps). Échec ignoré : pas de son.
    private func prepareSession() {
        guard !isSessionReady else { return }
        isSessionReady = true
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.ambient)
        try? session.setActive(true)
    }
}
