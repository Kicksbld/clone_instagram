import CoreGraphics
import Foundation
import Testing
@testable import CloneInstagram

/// Faux éditeur : publications enregistrées, erreur programmable.
final class FakePublisher: PostPublishing {
    var error: UploadError?
    private(set) var published: [(images: [Data], caption: String, authorId: String)] = []

    func publish(images: [Data], caption: String, authorId: String) async throws(UploadError) {
        published.append((images, caption, authorId))
        if let error {
            throw error
        }
    }
}

struct CreatePostViewModelTests {
    private let publisher = FakePublisher()

    private func makeViewModel(width: Int = 400, height: Int = 300) -> CreatePostViewModel {
        CreatePostViewModel(authorId: "me", publisher: publisher) { _ throws(ImagePreparationError) in
            guard let image = ImageCropperTests.image(width: width, height: height) else { throw .unreadableImage }
            return image
        }
    }

    @Test func `photo choisie : cadre au ratio d'origine, centré`() async {
        let viewModel = makeViewModel(width: 400, height: 300)

        await viewModel.loadPhoto(Data("photo".utf8))

        #expect(viewModel.canContinue)
        #expect(abs(viewModel.aspectRatio - 4.0 / 3.0) < 0.0001)
        #expect(viewModel.cropRect == CGRect(x: 0, y: 0, width: 400, height: 300))
    }

    @Test func `photo très haute : cadre ramené à 3:4`() async {
        let viewModel = makeViewModel(width: 900, height: 1600)

        await viewModel.loadPhoto(Data("photo".utf8))

        #expect(abs(viewModel.aspectRatio - 0.75) < 0.0001)
        #expect(viewModel.cropRect == CGRect(x: 0, y: 200, width: 900, height: 1200))
    }

    @Test func `bouton d'agrandissement : carré, puis retour au ratio d'origine`() async {
        let viewModel = makeViewModel(width: 400, height: 300)
        await viewModel.loadPhoto(Data("photo".utf8))

        viewModel.toggleSquare()

        #expect(viewModel.cropRect == CGRect(x: 50, y: 0, width: 300, height: 300))

        viewModel.toggleSquare()

        #expect(viewModel.cropRect == CGRect(x: 0, y: 0, width: 400, height: 300))
    }

    @Test func `geste terminé : zoom et centre ramenés dans la photo`() async {
        let viewModel = makeViewModel(width: 400, height: 300)
        await viewModel.loadPhoto(Data("photo".utf8))
        viewModel.toggleSquare()

        viewModel.commitCrop(zoom: 2, center: CGPoint(x: 1000, y: -50))

        #expect(viewModel.cropRect == CGRect(x: 250, y: 0, width: 150, height: 150))
    }

    @Test func `légende limitée à 2 200 caractères`() {
        let viewModel = makeViewModel()

        viewModel.caption = String(repeating: "a", count: 2300)

        #expect(viewModel.caption.count == 2200)
    }

    @Test func `partager : photo recadrée et légende sans espaces ajoutées à la file`() async {
        let viewModel = makeViewModel()
        await viewModel.loadPhoto(Data("photo".utf8))
        viewModel.caption = "  Salut  "

        let shared = await viewModel.share()

        #expect(shared)
        #expect(publisher.published.map(\.caption) == ["Salut"])
        #expect(publisher.published.map(\.authorId) == ["me"])
        #expect(publisher.published.first?.images.count == 1)
        #expect(publisher.published.first?.images.first?.isEmpty == false)
    }

    @Test func `partager en échec : message, écran gardé`() async {
        publisher.error = .unreadableImage
        let viewModel = makeViewModel()
        await viewModel.loadPhoto(Data("photo".utf8))

        let shared = await viewModel.share()

        #expect(!shared)
        #expect(viewModel.shareErrorMessage != nil)
    }

    @Test func `photo illisible : message, Suivant impossible`() async {
        let viewModel = CreatePostViewModel(authorId: "me", publisher: publisher) { _ throws(ImagePreparationError) in
            throw .unreadableImage
        }

        await viewModel.loadPhoto(Data())

        #expect(!viewModel.canContinue)
        guard case .failed = viewModel.photo else {
            Issue.record("État attendu : failed")
            return
        }
    }

    /// Décodeur de test : la donnée « LxH » donne une image de L × H pixels.
    private func makeCarouselViewModel() -> CreatePostViewModel {
        CreatePostViewModel(authorId: "me", publisher: publisher) { data throws(ImagePreparationError) in
            let size = (String(bytes: data, encoding: .utf8) ?? "").split(separator: "x").compactMap { Int($0) }
            guard size.count == 2, let image = ImageCropperTests.image(width: size[0], height: size[1]) else {
                throw .unreadableImage
            }
            return image
        }
    }

    private func select(_ sizes: [String], in viewModel: CreatePostViewModel) async {
        await viewModel.updateSelection(sizes.map(AnyHashable.init)) { id in
            (id.base as? String).map { Data($0.utf8) }
        }
    }

    @Test func `carrousel : ratio de la première photo appliqué à toutes, dernière ajoutée affichée`() async {
        let viewModel = makeCarouselViewModel()

        await select(["400x300", "300x400"], in: viewModel)

        #expect(viewModel.photos.count == 2)
        #expect(viewModel.selectedIndex == 1)
        #expect(abs(viewModel.aspectRatio - 4.0 / 3.0) < 0.0001)
        #expect(viewModel.cropRect == CGRect(x: 0, y: 87.5, width: 300, height: 225))
    }

    @Test func `carrousel : cadrage propre à chaque photo, gardé quand on en ajoute une`() async {
        let viewModel = makeCarouselViewModel()
        await select(["400x300"], in: viewModel)
        viewModel.commitCrop(zoom: 2, center: CGPoint(x: 1000, y: 0))

        await select(["400x300", "800x600"], in: viewModel)
        viewModel.select(AnyHashable("400x300"))

        #expect(viewModel.cropRect == CGRect(x: 200, y: 0, width: 200, height: 150))
        viewModel.select(AnyHashable("800x600"))
        #expect(viewModel.cropRect == CGRect(x: 0, y: 0, width: 800, height: 600))
    }

    @Test func `carrousel : carré appliqué à toutes les photos`() async {
        let viewModel = makeCarouselViewModel()
        await select(["400x300", "300x400"], in: viewModel)

        viewModel.toggleSquare()

        #expect(viewModel.cropRect == CGRect(x: 0, y: 50, width: 300, height: 300))
        viewModel.select(AnyHashable("400x300"))
        #expect(viewModel.cropRect == CGRect(x: 50, y: 0, width: 300, height: 300))
    }

    @Test func `carrousel : 10 photos au plus`() async {
        let viewModel = makeCarouselViewModel()

        await select((1 ... 11).map { "\(100 + $0)x100" }, in: viewModel)

        #expect(viewModel.photos.count == 10)
    }

    @Test func `carrousel : une photo illisible est écartée avec un message`() async {
        let viewModel = makeCarouselViewModel()

        await select(["400x300", "illisible"], in: viewModel)

        #expect(viewModel.photos.count == 1)
        #expect(viewModel.loadErrorMessage != nil)
        #expect(viewModel.canContinue)
    }

    @Test func `partager un carrousel : une image recadrée par photo, dans l'ordre`() async {
        let viewModel = makeCarouselViewModel()
        await select(["400x300", "300x400", "500x500"], in: viewModel)

        let shared = await viewModel.share()

        #expect(shared)
        #expect(publisher.published.first?.images.count == 3)
    }
}
