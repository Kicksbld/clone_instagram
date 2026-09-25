import CoreGraphics
import Foundation
import Observation

/// Nouvelle publication (T6a : une photo) : choix, recadrage comme Instagram, légende, puis ajout à la
/// file de publication, qui continue sans l'écran.
@Observable
final class CreatePostViewModel {
    enum PhotoState {
        case empty
        case loading
        case loaded(CGImage)
        case failed(message: String)
    }

    static let captionMaxLength = 2200

    private(set) var photo: PhotoState = .empty
    /// Cadre carré (1:1) ; sinon ratio de la photo, borné entre 3:4 et 1.91:1.
    private(set) var isSquare = false
    private(set) var zoom = 1.0
    /// Centre de la zone gardée, en pixels de la photo.
    private(set) var center = CGPoint.zero
    var caption = "" {
        didSet {
            if caption.count > Self.captionMaxLength {
                caption = String(caption.prefix(Self.captionMaxLength))
            }
        }
    }

    private(set) var isSharing = false
    /// Échec du partage, affiché en alerte ; `nil` une fois fermée.
    var shareErrorMessage: String?

    private let authorId: String
    private let publisher: any PostPublishing
    private let decode: @Sendable (Data) async throws(ImagePreparationError) -> CGImage
    private var loadGeneration = 0

    init(
        authorId: String,
        publisher: any PostPublishing,
        decode: @escaping @Sendable (Data) async throws(ImagePreparationError) -> CGImage = { data throws(ImagePreparationError) in
            try await ImageCropper.editableImage(from: data)
        }
    ) {
        self.authorId = authorId
        self.publisher = publisher
        self.decode = decode
    }

    var image: CGImage? {
        if case let .loaded(image) = photo {
            image
        } else {
            nil
        }
    }

    var imageSize: CGSize {
        image.map { CGSize(width: $0.width, height: $0.height) } ?? .zero
    }

    /// Ratio largeur / hauteur du cadre.
    var aspectRatio: Double {
        guard imageSize.height > 0 else { return 1 }
        return isSquare ? 1 : ImageCropper.clampedAspectRatio(imageSize.width / imageSize.height)
    }

    /// Zone gardée, en pixels de la photo.
    var cropRect: CGRect {
        cropRect(zoom: zoom, center: center)
    }

    func cropRect(zoom: Double, center: CGPoint) -> CGRect {
        ImageCropper.cropRect(imageSize: imageSize, aspectRatio: aspectRatio, zoom: zoom, center: center)
    }

    /// Aperçu recadré (écran légende).
    var croppedPreview: CGImage? {
        image?.cropping(to: cropRect.integral)
    }

    var canContinue: Bool {
        image != nil
    }

    func loadPhoto(_ data: Data) async {
        loadGeneration += 1
        let generation = loadGeneration
        photo = .loading
        do {
            let image = try await decode(data)
            // Une autre photo a été choisie entre-temps.
            guard generation == loadGeneration else { return }
            photo = .loaded(image)
            isSquare = false
            resetCrop()
        } catch {
            guard generation == loadGeneration else { return }
            photo = .failed(message: UploadError.message(for: .unreadableImage))
        }
    }

    func photoLoadFailed() {
        photo = .failed(message: UploadError.message(for: .unreadableImage))
    }

    /// Bouton d'agrandissement : carré ↔ ratio d'origine.
    func toggleSquare() {
        isSquare.toggle()
        resetCrop()
    }

    /// Fin d'un geste : zoom et centre retenus, ramenés dans la photo.
    func commitCrop(zoom: Double, center: CGPoint) {
        self.zoom = min(max(zoom, 1), ImageCropper.maxZoom)
        let rect = cropRect(zoom: self.zoom, center: center)
        self.center = CGPoint(x: rect.midX, y: rect.midY)
    }

    /// Recadre, prépare et ajoute la photo à la file ; `true` si l'écran peut se fermer.
    func share() async -> Bool {
        guard let image, !isSharing else { return false }
        isSharing = true
        defer { isSharing = false }
        let data: Data
        do {
            data = try await ImageCropper.jpegData(of: image, croppedTo: cropRect)
        } catch {
            shareErrorMessage = UploadError.message(for: .unreadableImage)
            return false
        }
        do {
            try await publisher.publish(
                imageData: data,
                caption: caption.trimmingCharacters(in: .whitespacesAndNewlines),
                authorId: authorId
            )
            return true
        } catch {
            shareErrorMessage = UploadError.message(for: error)
            return false
        }
    }

    private func resetCrop() {
        zoom = 1
        center = CGPoint(x: imageSize.width / 2, y: imageSize.height / 2)
    }
}
