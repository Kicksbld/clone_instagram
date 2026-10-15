import Testing
@testable import CloneInstagram

struct AnalyticsEventTests {
    private static let allEvents: [AnalyticsEvent] = [
        .onboardingStepCompleted(.birthDate),
        .paywallViewed(.test, .onboarding),
        .purchaseStarted(.control, .settings),
        .purchaseCompleted(.test, .settings),
        .purchaseCancelled(.control, .onboarding),
        .postPublished(mediaCount: 3),
        .postLiked(.doubleTap),
        .userFollowed(.list),
    ]

    @Test func `noms snake_case au passé (ADR-013)`() {
        #expect(Self.allEvents.map(\.name) == [
            "onboarding_step_completed", "paywall_viewed", "purchase_started", "purchase_completed",
            "purchase_cancelled", "post_published", "post_liked", "user_followed",
        ])
    }

    @Test func `propriétés techniques uniquement, aucune donnée personnelle`() {
        let keys = Set(Self.allEvents.flatMap(\.properties.keys))
        #expect(keys == ["step", "variant", "source", "media_count"])
        #expect(AnalyticsEvent.paywallViewed(.test, .onboarding).properties == ["variant": "test", "source": "onboarding"])
        #expect(AnalyticsEvent.onboardingStepCompleted(.birthDate).properties == ["step": "birth_date"])
        #expect(AnalyticsEvent.postLiked(.doubleTap).properties == ["source": "double_tap"])
    }

    @Test(arguments: [
        ("test" as String?, PaywallVariant.test),
        ("control", .control),
        ("inconnue", .control),
        (nil, .control),
    ])
    func `variante lue sur le flag, control par défaut`(value: String?, expected: PaywallVariant) {
        #expect(PaywallVariant(flagValue: value) == expected)
    }

    @Test func `flag booléen (expérience mal configurée) → control`() {
        #expect(PaywallVariant(flagValue: true) == .control)
    }
}

struct PostHogConfigurationTests {
    @Test func `clé et hôte présents → configuration`() throws {
        let configuration = try PostHogConfiguration(rawAPIKey: "phc_test", rawHost: "https://us.i.posthog.com")
        #expect(configuration.apiKey == "phc_test")
        #expect(configuration.host == "https://us.i.posthog.com")
    }

    @Test(arguments: [nil, "", "$(POSTHOG_HOST)"])
    func `hôte absent → région UE`(host: String?) throws {
        #expect(try PostHogConfiguration(rawAPIKey: "phc_test", rawHost: host).host == "https://eu.i.posthog.com")
    }

    @Test(arguments: [nil, "", "$(POSTHOG_API_KEY)"])
    func `clé absente ou non substituée → erreur`(raw: String?) {
        #expect(throws: PostHogConfigurationError.missingAPIKey) {
            try PostHogConfiguration(rawAPIKey: raw, rawHost: nil)
        }
    }

    @Test(arguments: ["eu.i.posthog.com", "http://eu.i.posthog.com"])
    func `hôte invalide ou non HTTPS → erreur`(host: String) {
        #expect(throws: PostHogConfigurationError.invalidHost) {
            try PostHogConfiguration(rawAPIKey: "phc_test", rawHost: host)
        }
    }
}
