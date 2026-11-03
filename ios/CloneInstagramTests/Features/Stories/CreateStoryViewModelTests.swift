import Foundation
import Testing
@testable import CloneInstagram

/// Nouvelle story : envoi de la photo (`purpose` story, attente de `ready`), audience, erreurs réessayables.
struct CreateStoryViewModelTests {
    private let uploads = FakeUploadService()
    private let service = FakeStoryService()
    private let photo = Data([0xFF, 0xD8])

    @Test func `partage aux amis proches : photo envoyée pour une story puis publiée`() async {
        var publishedCount = 0
        let viewModel = CreateStoryViewModel(uploads: uploads, service: service) { publishedCount += 1 }
        viewModel.select(photo)
        viewModel.audience = .closeFriends

        await viewModel.share()

        #expect(uploads.uploads.map(\.purpose) == [.story])
        #expect(service.published.map(\.audience) == [.closeFriends])
        #expect(service.published.map(\.mediaId) == [uploads.mediaId])
        #expect(viewModel.state == .published)
        #expect(publishedCount == 1)
    }

    @Test func `sans photo : rien n'est envoyé`() async {
        let viewModel = CreateStoryViewModel(uploads: uploads, service: service)

        await viewModel.share()

        #expect(!viewModel.canShare)
        #expect(uploads.uploads.isEmpty)
    }

    @Test func `échec de l'envoi : message de l'upload`() async {
        uploads.error = .rejected(.invalidImage)
        let viewModel = CreateStoryViewModel(uploads: uploads, service: service)
        viewModel.select(photo)

        await viewModel.share()

        #expect(viewModel.state == .failed(message: "Ce fichier n'est pas une photo valide. Choisissez-en une autre."))
    }

    @Test func `échec de la publication : réessayer ne renvoie pas la photo déjà prête`() async {
        service.publishError = .unreachable
        let viewModel = CreateStoryViewModel(uploads: uploads, service: service)
        viewModel.select(photo)
        await viewModel.share()
        #expect(viewModel.state == .failed(message: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."))

        service.publishError = nil
        await viewModel.share()

        #expect(uploads.uploads.count == 1)
        #expect(service.published.count == 2)
        #expect(viewModel.state == .published)
    }

    @Test func `trop de stories : message dédié`() async {
        service.publishError = .rateLimited
        let viewModel = CreateStoryViewModel(uploads: uploads, service: service)
        viewModel.select(photo)

        await viewModel.share()

        #expect(viewModel.state == .failed(message: "Trop de stories publiées. Réessayez plus tard."))
    }
}
