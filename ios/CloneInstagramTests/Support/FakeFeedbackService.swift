@testable import CloneInstagram

/// Faux `FeedbackService` : repères joués enregistrés, son coupé programmable.
final class FakeFeedbackService: FeedbackService {
    var isMuted = false
    private(set) var cues: [FeedbackCue] = []

    func play(_ cue: FeedbackCue) {
        cues.append(cue)
    }
}
