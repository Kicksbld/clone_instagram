import Testing
@testable import CloneInstagram

/// Entonnoir de l'onboarding et identification (ADR-013).
struct OnboardingAnalyticsTests {
    private let context = OnboardingTestContext()

    private var steps: [OnboardingStepName] {
        context.analytics.events.compactMap { event in
            if case let .onboardingStepCompleted(step) = event {
                step
            } else {
                nil
            }
        }
    }

    @Test func `une étape envoyée par avancée`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()

        #expect(steps == [.password, .birthDate, .fullName])

        viewModel.submitUsername()
        #expect(steps.last == .username)
    }

    @Test func `retour arrière : rien n'est envoyé`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        let count = context.analytics.events.count

        viewModel.path.removeLast()

        #expect(context.analytics.events.count == count)
    }

    @Test func `accepter les conditions : profil identifié avant le paywall, étape terms envoyée`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()

        await viewModel.acceptTerms()

        let profile = try #require(viewModel.profile)
        #expect(context.analytics.identified == [profile.id])
        #expect(steps.suffix(2) == [.username, .terms])
    }

    @Test func `username pris à l'acceptation : ni identification ni étape terms`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        context.identity.onboardingResults = [.failure(.usernameTaken)]

        await viewModel.acceptTerms()

        #expect(context.analytics.identified.isEmpty)
        #expect(!steps.contains(.terms))
    }

    @Test func `parcours jusqu'au compte prêt`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        viewModel.skipProfilePhoto()
        viewModel.skipBio()
        viewModel.finish()

        #expect(steps.suffix(4) == [.terms, .profilePhoto, .bio, .completed])
    }
}
