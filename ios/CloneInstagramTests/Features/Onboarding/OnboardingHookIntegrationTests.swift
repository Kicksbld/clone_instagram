import Foundation
import Testing
@testable import CloneInstagram

/// Place du hook dans l'onboarding (ADR-038) : nouveau compte seulement, résultat repris par l'inscription.
struct OnboardingHookIntegrationTests {
    private let context = OnboardingTestContext()

    @Test func `nouveau compte : le hook passe avant l'inscription`() {
        let viewModel = context.makeViewModel(entry: .newAccount)

        #expect(viewModel.hook != nil)
        #expect(viewModel.isHookDone == false)
        #expect(viewModel.currentStep == .createAccount)
    }

    @Test(arguments: [AuthProvider.email, .apple])
    func `reprise d'un onboarding : pas de hook`(provider: AuthProvider) {
        let viewModel = context.makeViewModel(entry: .resume(provider))

        #expect(viewModel.hook == nil)
        #expect(viewModel.isHookDone)
    }

    @Test func `hook passé : inscription affichée avec les réponses`() throws {
        let viewModel = context.makeViewModel(entry: .newAccount)
        let hook = try #require(viewModel.hook)
        hook.next()
        hook.next()
        hook.toggle(.sport)

        hook.skip()

        #expect(viewModel.isHookDone)
        #expect(viewModel.hookResult == OnboardingHookResult(interests: [.sport], photo: nil))
    }

    @Test func `photo du hook envoyée comme photo de profil après la création du profil`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.hookFinished(OnboardingHookResult(interests: [], photo: Data("hook".utf8)))
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        await viewModel.useHookPhoto()

        #expect(context.uploads.uploads.map(\.data) == [Data("hook".utf8)])
        #expect(context.identity.updates == [ProfileChanges(avatarMediaId: context.uploads.mediaId)])
        #expect(viewModel.path == [.bio])
    }

    @Test func `sans photo du hook : rien n'est envoyé`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        await viewModel.useHookPhoto()

        #expect(context.uploads.uploads.isEmpty)
    }

    @Test func `étape d'inscription affichée : écran envoyé`() {
        let viewModel = context.makeViewModel(entry: .resume(.email))

        viewModel.screenViewed()

        #expect(context.analytics.events == [.onboardingScreenViewed(.password)])
    }
}
