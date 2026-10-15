@testable import CloneInstagram

/// Faux `AnalyticsService` : événements et appels enregistrés, variante du paywall programmable.
final class FakeAnalyticsService: AnalyticsService {
    var variant: PaywallVariant = .control
    private(set) var events: [AnalyticsEvent] = []
    private(set) var identified: [String] = []
    private(set) var resetCount = 0

    func track(_ event: AnalyticsEvent) {
        events.append(event)
    }

    func identify(profileId: String) {
        identified.append(profileId)
    }

    func reset() {
        resetCount += 1
    }

    func paywallVariant() async -> PaywallVariant {
        variant
    }
}
