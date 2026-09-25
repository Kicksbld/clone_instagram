import Foundation
import Testing
@testable import CloneInstagram

struct EditProfileViewModelTests {
    private let identity = FakeIdentityService()
    private let uploads = FakeUploadService()
    private let updated = UpdatedRecorder()

    private func makeViewModel(profile: Profile = .fixture(bio: "Dev")) -> EditProfileViewModel {
        EditProfileViewModel(profile: profile, identity: identity, uploads: uploads) { [updated] in
            updated.profiles.append($0)
        }
    }

    // MARK: - Photo

    @Test func `nouvelle photo → envoi, PATCH /me, accueil mis à jour sans toucher la saisie`() async {
        let viewModel = makeViewModel()
        viewModel.bio = "Bio en cours de saisie"

        await viewModel.changePhoto(Data("photo".utf8))

        #expect(uploads.uploads.map(\.purpose) == [.avatar])
        #expect(identity.updates == [ProfileChanges(avatarMediaId: uploads.mediaId)])
        #expect(viewModel.profile.avatar == .fixture)
        #expect(viewModel.bio == "Bio en cours de saisie")
        #expect(updated.profiles.last?.avatar == .fixture)
        #expect(!viewModel.isUpdatingPhoto)
    }

    @Test func `échec de l'envoi → message, photo inchangée`() async {
        let viewModel = makeViewModel()
        uploads.error = .rejected(.fileTooLarge)

        await viewModel.changePhoto(Data("photo".utf8))

        #expect(viewModel.errorMessage == "Cette photo est trop lourde. Choisissez-en une autre.")
        #expect(viewModel.profile.avatar == nil)
        #expect(updated.profiles.isEmpty)
    }

    @Test func `supprimer la photo → DELETE /me/avatar`() async {
        var profile = Profile.fixture()
        profile.avatar = .fixture
        let viewModel = makeViewModel(profile: profile)

        await viewModel.removePhoto()

        #expect(identity.removeAvatarCount == 1)
        #expect(viewModel.profile.avatar == nil)
        #expect(updated.profiles.last?.avatar == nil)
    }

    @Test func `supprimer sans photo → aucun appel`() async {
        await makeViewModel().removePhoto()

        #expect(identity.removeAvatarCount == 0)
    }

    // MARK: - Nom, username, bio

    @Test func `enregistre uniquement les champs modifiés, nettoyés, puis ferme`() async {
        let viewModel = makeViewModel()
        viewModel.fullName = "  Killian B  "
        viewModel.username = "Killian.B"

        await viewModel.save()

        #expect(identity.updates == [ProfileChanges(username: "killian.b", fullName: "Killian B")])
        #expect(viewModel.didFinish)
        #expect(updated.profiles.last?.username == "killian.b")
    }

    @Test func `aucune modification → ferme sans appel`() async {
        let viewModel = makeViewModel()

        await viewModel.save()

        #expect(identity.updates.isEmpty)
        #expect(viewModel.didFinish)
    }

    @Test(arguments: [
        ("fullName", ""),
        ("username", "pas valide !"),
        ("bio", String(repeating: "a", count: 151)),
    ])
    func `saisie invalide → message, sans appel`(field: String, value: String) async {
        let viewModel = makeViewModel()
        switch field {
        case "fullName": viewModel.fullName = value
        case "username": viewModel.username = value
        default: viewModel.bio = value
        }

        await viewModel.save()

        #expect(viewModel.errorMessage != nil)
        #expect(identity.updates.isEmpty)
        #expect(!viewModel.didFinish)
    }

    @Test func `username pris → message, l'écran reste ouvert`() async {
        let viewModel = makeViewModel()
        identity.updateError = .usernameTaken
        viewModel.username = "autre"

        await viewModel.save()

        #expect(viewModel.errorMessage == "Ce nom d'utilisateur est déjà pris.")
        #expect(!viewModel.didFinish)
        #expect(!viewModel.isSaving)
    }
}

final class UpdatedRecorder {
    var profiles: [Profile] = []
}
