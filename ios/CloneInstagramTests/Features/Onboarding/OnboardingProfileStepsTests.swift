import Foundation
import Testing
@testable import CloneInstagram

/// Onboarding, partie profil : username, conditions (création du profil), photo, bio.
struct OnboardingProfileStepsTests {
    private let context = OnboardingTestContext()

    // MARK: - Username

    @Test func `suggestion tirée du nom, libre`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()

        #expect(viewModel.currentStep == .username)
        #expect(viewModel.username == "killianb")
        #expect(viewModel.usernameStatus == .available)
    }

    @Test func `suggestion tirée du nom, prise → première suggestion de l'API`() async throws {
        context.identity.takenUsernames = ["killianb": ["killianb_", "killianb."]]

        let viewModel = try await context.viewModelAtUsernameStep()

        #expect(viewModel.username == "killianb_")
        #expect(viewModel.usernameStatus == .available)
    }

    @Test func `saisie en direct : username pris → suggestions`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        context.identity.takenUsernames = ["killian": ["killian_", "killian."]]

        viewModel.usernameChanged("Killian")
        await viewModel.usernameCheck?.value

        #expect(viewModel.username == "killian")
        #expect(viewModel.usernameStatus == .taken(suggestions: ["killian_", "killian."]))

        viewModel.chooseSuggestion("killian.")
        #expect(viewModel.username == "killian.")
        #expect(viewModel.usernameStatus == .available)
    }

    @Test func `saisie en direct : format invalide sans appel`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        let callsBefore = context.identity.checkedUsernames.count

        viewModel.usernameChanged("kil lian")

        #expect(viewModel.usernameStatus == .invalid)
        #expect(context.identity.checkedUsernames.count == callsBefore)
    }

    @Test func `saisie en direct : vérification impossible → échec`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        context.identity.checkError = .unreachable

        viewModel.usernameChanged("killian2")
        await viewModel.usernameCheck?.value

        #expect(viewModel.usernameStatus == .failed)
    }

    @Test func `bouton Suivant uniquement si le username est disponible`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        context.identity.takenUsernames = ["pris": ["pris_"]]
        viewModel.usernameChanged("pris")
        await viewModel.usernameCheck?.value

        viewModel.submitUsername()

        #expect(viewModel.currentStep == .username)
    }

    // MARK: - Conditions (création du profil)

    @Test func `accepter les conditions → profil créé, plus de retour arrière`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()

        await viewModel.acceptTerms()

        let expected = FakeIdentityService.OnboardingRequest(
            username: "killianb",
            fullName: "Killian B",
            birthDate: BirthDate(year: 2000, month: 1, day: 31)
        )
        #expect(context.identity.onboardingRequests == [expected])
        #expect(viewModel.profile?.username == "killianb")
        #expect(viewModel.rootStep == .profilePhoto)
        #expect(viewModel.path.isEmpty)
    }

    @Test func `username pris entre-temps → retour au username avec suggestions`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        context.identity.onboardingResults = [.failure(.usernameTaken)]
        context.identity.takenUsernames = ["killianb": ["killianb_"]]

        await viewModel.acceptTerms()

        #expect(viewModel.currentStep == .username)
        #expect(viewModel.usernameStatus == .taken(suggestions: ["killianb_"]))
        #expect(viewModel.errorMessage != nil)
        #expect(viewModel.profile == nil)
    }

    @Test func `API injoignable → message, puis nouvel essai réussi`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        context.identity.onboardingResults = [.failure(.unreachable)]

        await viewModel.acceptTerms()
        #expect(viewModel.errorMessage == OnboardingViewModel.message(for: IdentityServiceError.unreachable))
        #expect(viewModel.currentStep == .terms)

        await viewModel.acceptTerms()
        #expect(viewModel.rootStep == .profilePhoto)
    }

    @Test func `moins de 13 ans selon l'API → message`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        context.identity.onboardingResults = [.failure(.ageRequirementNotMet)]

        await viewModel.acceptTerms()

        #expect(viewModel.errorMessage == OnboardingViewModel.message(for: IdentityServiceError.ageRequirementNotMet))
    }

    @Test func `profil déjà créé → accueil avec le profil existant`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        context.identity.onboardingResults = [.failure(.profileAlreadyExists)]
        context.identity.meResults = [.success(.fixture(username: "existant"))]

        await viewModel.acceptTerms()

        #expect(context.finished.profiles == [.fixture(username: "existant")])
    }

    // MARK: - Photo, bio, fin

    @Test func `photo choisie → envoi, PATCH /me avec le média, puis étape bio`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        await viewModel.addProfilePhoto(Data("photo".utf8))

        #expect(context.uploads.uploads.map(\.purpose) == [.avatar])
        #expect(context.identity.updates == [ProfileChanges(avatarMediaId: context.uploads.mediaId)])
        #expect(viewModel.profile?.avatar == .fixture)
        #expect(viewModel.path == [.bio])
        #expect(viewModel.errorMessage == nil)
    }

    @Test(arguments: [
        (UploadError.rejected(.invalidImage), "Ce fichier n'est pas une photo valide. Choisissez-en une autre."),
        (.transferFailed, "L'envoi de la photo a échoué. Vérifiez votre connexion et réessayez."),
        (.timedOut, "Le traitement de la photo prend trop de temps. Réessayez."),
    ])
    func `échec de l'envoi → message, on reste sur l'étape photo`(error: UploadError, message: String) async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()
        context.uploads.error = error

        await viewModel.addProfilePhoto(Data("photo".utf8))

        #expect(viewModel.currentStep == .profilePhoto)
        #expect(viewModel.errorMessage == message)
        #expect(context.identity.updates.isEmpty)
        #expect(!viewModel.isLoading)
    }

    @Test func `photo refusée par l'API → message, on reste sur l'étape photo`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()
        context.identity.updateError = .mediaRejected

        await viewModel.addProfilePhoto(Data("photo".utf8))

        #expect(viewModel.currentStep == .profilePhoto)
        #expect(viewModel.errorMessage == "Cette photo n'a pas pu être utilisée. Choisissez-en une autre.")
    }

    @Test func `photo illisible dans la photothèque → message`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        viewModel.profilePhotoLoadFailed()

        #expect(viewModel.errorMessage == "Cette photo n'a pas pu être lue. Choisissez-en une autre.")
        #expect(context.uploads.uploads.isEmpty)
    }

    @Test func `photo passée, bio vide → compte prêt sans appel`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()

        viewModel.skipProfilePhoto()
        viewModel.bio = "   "
        await viewModel.submitBio()

        #expect(viewModel.path == [.bio, .completed])
        #expect(context.identity.updates.isEmpty)
    }

    @Test func `bio enregistrée par PATCH /me, sans espaces superflus`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()
        viewModel.skipProfilePhoto()

        viewModel.bio = "  Dev iOS  "
        await viewModel.submitBio()

        #expect(context.identity.updates == [ProfileChanges(bio: "Dev iOS")])
        #expect(viewModel.currentStep == .completed)

        viewModel.finish()
        #expect(context.finished.profiles == [.fixture(bio: "Dev iOS")])
    }

    @Test func `échec de la bio → message, on reste sur l'étape`() async throws {
        let viewModel = try await context.viewModelAtUsernameStep()
        viewModel.submitUsername()
        await viewModel.acceptTerms()
        viewModel.skipProfilePhoto()
        context.identity.updateError = .unreachable

        viewModel.bio = "Dev iOS"
        await viewModel.submitBio()

        #expect(viewModel.currentStep == .bio)
        #expect(viewModel.errorMessage != nil)
    }
}
