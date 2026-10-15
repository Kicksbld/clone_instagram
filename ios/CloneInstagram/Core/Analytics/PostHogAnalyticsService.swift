import Foundation
import os
import PostHog

/// `AnalyticsService` sur le SDK `posthog-ios` (ADR-013), seul fichier qui importe `PostHog`.
struct PostHogAnalyticsService: AnalyticsService {
    /// Attente maximale des flags à l'ouverture du paywall, avant de retenir `control`.
    static let flagTimeout: Duration = .seconds(2)

    init(configuration: PostHogConfiguration) {
        let config = PostHogConfig(projectToken: configuration.apiKey, host: configuration.host)
        // Seuls les événements explicites d'ADR-013 partent : ni autocapture, ni écrans, ni cycle de vie,
        // ni enregistrement de session, ni sondages, ni erreurs capturées automatiquement.
        config.captureApplicationLifecycleEvents = false
        config.captureScreenViews = false
        config.captureElementInteractions = false
        config.sessionReplay = false
        config.surveys = false
        config.errorTrackingConfig.autoCapture = false
        config.enableSwizzling = false
        // Pas de localisation déduite de l'IP (aucune donnée personnelle).
        config.disableGeoIp = true
        PostHogSDK.shared.setup(config)
    }

    func track(_ event: AnalyticsEvent) {
        PostHogSDK.shared.capture(event.name, properties: event.properties)
    }

    func identify(profileId: String) {
        PostHogSDK.shared.identify(profileId)
    }

    func reset() {
        PostHogSDK.shared.reset()
    }

    func paywallVariant() async -> PaywallVariant {
        // Flags déjà chargés (lancement, `identify`) : lecture immédiate, qui enregistre l'exposition.
        if let value = PostHogSDK.shared.getFeatureFlag(PaywallVariant.flagKey) {
            return PaywallVariant(flagValue: value)
        }
        await reloadFlags(timeout: Self.flagTimeout)
        return PaywallVariant(flagValue: PostHogSDK.shared.getFeatureFlag(PaywallVariant.flagKey))
    }

    /// Recharge les flags, sans attendre plus que `timeout` (PostHog lent ou injoignable).
    private func reloadFlags(timeout: Duration) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let resume = ResumeOnce(continuation)
            PostHogSDK.shared.reloadFeatureFlags { resume() }
            Task {
                try? await Task.sleep(for: timeout)
                resume()
            }
        }
    }
}

/// Reprend une continuation une seule fois : au premier des deux, réponse de PostHog ou délai écoulé.
private final nonisolated class ResumeOnce: Sendable {
    private let continuation: OSAllocatedUnfairLock<CheckedContinuation<Void, Never>?>

    init(_ continuation: CheckedContinuation<Void, Never>) {
        self.continuation = OSAllocatedUnfairLock(initialState: continuation)
    }

    func callAsFunction() {
        let pending = continuation.withLock { value in
            defer { value = nil }
            return value
        }
        pending?.resume()
    }
}
