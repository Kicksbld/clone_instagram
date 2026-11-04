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
    }

    @Test func `interrupteur changé pendant l'appel, sans attendre l'API`() async {
        let viewModel = AccountPrivacyViewModel(isPrivate: false, identity: identity)
        var duringCall: Bool?
        identity.duringSettingsUpdate = { duringCall = viewModel.isPrivate }

        await viewModel.setPrivate(true)

        #expect(duringCall == true)
    }

    @Test func `changement pendant l'appel : le dernier choix gagne`() async {
        var updated: [Bool] = []
        let viewModel = AccountPrivacyViewModel(isPrivate: false, identity: identity) { updated.append($0.isPrivate) }
        identity.duringSettingsUpdate = { await viewModel.setPrivate(false) }

        await viewModel.setPrivate(true)

        #expect(identity.settingsUpdates == [true, false])
        #expect(!viewModel.isPrivate)
        #expect(updated == [false])
    }

    @Test func `même valeur → aucun appel`() async {
        let viewModel = AccountPrivacyViewModel(isPrivate: true, identity: identity)

        await viewModel.setPrivate(true)

        #expect(identity.settingsUpdates.isEmpty)
    }

    @Test func `activité dans l’onglet Amis → Personne, enregistrée et profil mis à jour`() async {
        var updated: Profile?
        let viewModel = AccountPrivacyViewModel(isPrivate: false, identity: identity) { updated = $0 }

        await viewModel.setFriendsTabActivity(.nobody)

        #expect(identity.friendsTabActivityUpdates == [.nobody])
        #expect(viewModel.friendsTabActivity == .nobody)
        #expect(updated?.friendsTabActivity == .nobody)
    }

    @Test func `activité dans l’onglet Amis : échec → valeur précédente et message`() async {
        identity.settingsError = .unreachable
        let viewModel = AccountPrivacyViewModel(isPrivate: false, friendsTabActivity: .nobody, identity: identity)
        var duringCall: FriendsTabActivity?
        identity.duringSettingsUpdate = { duringCall = viewModel.friendsTabActivity }

        await viewModel.setFriendsTabActivity(.mutuals)

        #expect(duringCall == .mutuals)
        #expect(viewModel.friendsTabActivity == .nobody)
        #expect(viewModel.errorMessage != nil)
    }
}
