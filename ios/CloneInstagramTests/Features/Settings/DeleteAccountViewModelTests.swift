import Testing
@testable import CloneInstagram

struct DeleteAccountViewModelTests {
    private let identity = FakeIdentityService()

    @Test func `suppression réussie → déconnexion`() async {
        var deletedCount = 0
        let viewModel = DeleteAccountViewModel(identity: identity) { deletedCount += 1 }

        await viewModel.deleteAccount()

        #expect(identity.deleteMeCount == 1)
        #expect(deletedCount == 1)
        #expect(viewModel.errorMessage == nil)
        #expect(!viewModel.isDeleting)
    }

    @Test(arguments: [IdentityServiceError.unreachable, .unexpectedResponse(statusCode: 500)])
    func `échec → message et aucune déconnexion`(error: IdentityServiceError) async {
        identity.deleteMeError = error
        var deletedCount = 0
        let viewModel = DeleteAccountViewModel(identity: identity) { deletedCount += 1 }

        await viewModel.deleteAccount()

        #expect(deletedCount == 0)
        #expect(viewModel.errorMessage != nil)
        #expect(!viewModel.isDeleting)
    }
}
