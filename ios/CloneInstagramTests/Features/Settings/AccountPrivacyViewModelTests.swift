import Testing
@testable import CloneInstagram

struct AccountPrivacyViewModelTests {
    private let identity = FakeIdentityService()

    @Test func `passer en privé → enregistré, profil mis à jour partout`() async {
        var updated: Profile?
        let viewModel = AccountPrivacyViewModel(isPrivate: false, identity: identity) { updated = $0 }

        await viewModel.setPrivate(true)

        #expect(identity.settingsUpdates == [true])
        #expect(viewModel.isPrivate)
        #expect(updated?.isPrivate == true)
    }

    @Test func `échec → retour à l'état précédent et message`() async {
        identity.settingsError = .unreachable
        let viewModel = AccountPrivacyViewModel(isPrivate: true, identity: identity)

        await viewModel.setPrivate(false)

        #expect(viewModel.isPrivate)
        #expect(viewModel.errorMessage != nil)
        #expect(!viewModel.isSaving)
    }

    @Test func `même valeur → aucun appel`() async {
        let viewModel = AccountPrivacyViewModel(isPrivate: true, identity: identity)

        await viewModel.setPrivate(true)

        #expect(identity.settingsUpdates.isEmpty)
    }
}
