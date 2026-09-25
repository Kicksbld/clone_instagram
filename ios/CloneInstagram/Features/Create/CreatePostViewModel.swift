import CoreGraphics
import Foundation
import Observation

/// Nouvelle publication : 1 à 10 photos, recadrage comme Instagram, légende, puis ajout à la file de
/// publication, qui continue sans l'écran.
@Observable
final class CreatePostViewModel {
    enum PhotoState {
        case empty
        case loading
        case loaded(CGImage)
        case failed(message: String)
    }

    /// Une photo choisie et son cadrage (propre à chaque photo, comme sur Instagram).
    struct EditablePhoto: Identifiable {
        /// Élément du sélecteur de photos d'où vient la photo.
        let id: AnyHashable
        let image: CGImage
        var zoom = 1.0
        /// Centre de la zone gardée, en pixels de la photo.
        var center: CGPoint

        var size: CGSize {
            CGSize(width: image.width, height: image.height)
        }
    }

    static let captionMaxLength = 2200
    /// Carrousel : 10 photos au plus (contrat `POST /v1/posts`).
    static let maxPhotos = 10

    /// Photos choisies, dans l'ordre de sélection (ordre du carrousel).
    private(set) var photos: [EditablePhoto] = []
    /// Photo affichée dans le cadre de recadrage.
    private(set) var selectedIndex = 0
    private(set) var isLoading = false
    /// Toutes les photos choisies sont illisibles.
    private(set) var loadFailed = false
    /// Certaines photos n'ont pas pu être ouvertes (alerte) ; `nil` une fois fermée.
    var loadErrorMessage: String?
    /// Cadre carré (1:1) ; sinon ratio de la première photo, borné entre 3:4 et 1.91:1.
    private(set) var isSquare = false
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

    var photo: PhotoState {
        if isLoading, photos.isEmpty {
            .loading
        } else if let image {
            .loaded(image)
        } else if loadFailed {
            .failed(message: UploadError.message(for: .unreadableImage))
        } else {
            .empty
        }
    }

    private var selected: EditablePhoto? {
        photos.indices.contains(selectedIndex) ? photos[selectedIndex] : nil
    }

    var image: CGImage? {
        selected?.image
    }

    var imageSize: CGSize {
        selected?.size ?? .zero
    }

    var zoom: Double {
        selected?.zoom ?? 1
    }

    var center: CGPoint {
        selected?.center ?? .zero
    }

    /// Ratio largeur / hauteur du cadre, commun à toutes les photos : celui de la première.
    var aspectRatio: Double {
        guard let first = photos.first, first.size.height > 0 else { return 1 }
        return isSquare ? 1 : ImageCropper.clampedAspectRatio(first.size.width / first.size.height)
    }

    /// Zone gardée de la photo affichée, en pixels de la photo.
    var cropRect: CGRect {
        cropRect(zoom: zoom, center: center)
    }

    func cropRect(zoom: Double, center: CGPoint) -> CGRect {
        ImageCropper.cropRect(imageSize: imageSize, aspectRatio: aspectRatio, zoom: zoom, center: center)
    }

    /// Aperçu recadré de la première photo (écran légende).
    var croppedPreview: CGImage? {
        guard let first = photos.first else { return nil }
        return first.image.cropping(to: cropRect(of: first).integral)
    }

    var canContinue: Bool {
        !photos.isEmpty && !isLoading
    }

    /// Une seule photo (mode simple du sélecteur).
    func loadPhoto(_ data: Data) async {
        await updateSelection([AnyHashable(UUID())]) { _ in data }
    }

    /**
     Nouvelle sélection du sélecteur, dans l'ordre : les photos déjà chargées gardent leur cadrage, les
     nouvelles sont chargées par `data` ; la dernière ajoutée devient la photo affichée.
     */
    func updateSelection(_ ids: [AnyHashable], data: (AnyHashable) async -> Data?) async {
        loadGeneration += 1
        let generation = loadGeneration
        let ids = Array(ids.prefix(Self.maxPhotos))
        let previousId = selected?.id
        let loaded = Dictionary(photos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        isLoading = true
        loadFailed = false

        var result: [EditablePhoto] = []
        var failures = 0
        var added: AnyHashable?
        for id in ids {
            if let photo = loaded[id] {
                result.append(photo)
                continue
            }
            guard let bytes = await data(id), let image = try? await decode(bytes) else {
                failures += 1
                continue
            }
            // Une autre sélection a été faite entre-temps.
            guard generation == loadGeneration else { return }
            let size = CGSize(width: image.width, height: image.height)
            result.append(EditablePhoto(id: id, image: image, center: CGPoint(x: size.width / 2, y: size.height / 2)))
            added = id
        }
        guard generation == loadGeneration else { return }

        photos = result
        isLoading = false
        loadFailed = result.isEmpty && failures > 0
        if result.count <= 1 {
            isSquare = false
        }
        let shown = added ?? previousId
        selectedIndex = result.firstIndex { $0.id == shown } ?? max(result.count - 1, 0)
        if failures > 0, !result.isEmpty {
            loadErrorMessage = "Certaines photos n'ont pas pu être ouvertes."
        }
    }

    func photoLoadFailed() {
        photos = []
        isLoading = false
        loadFailed = true
    }

    /// Affiche une photo du carrousel dans le cadre de recadrage.
    func select(_ id: AnyHashable) {
        if let index = photos.firstIndex(where: { $0.id == id }) {
            selectedIndex = index
        }
    }

    /// Bouton d'agrandissement : carré ↔ ratio d'origine, pour toutes les photos.
    func toggleSquare() {
        isSquare.toggle()
        for index in photos.indices {
            photos[index].zoom = 1
            photos[index].center = CGPoint(x: photos[index].size.width / 2, y: photos[index].size.height / 2)
        }
    }

    /// Fin d'un geste : zoom et centre de la photo affichée retenus, ramenés dans la photo.
    func commitCrop(zoom: Double, center: CGPoint) {
        guard photos.indices.contains(selectedIndex) else { return }
        photos[selectedIndex].zoom = min(max(zoom, 1), ImageCropper.maxZoom)
        let rect = cropRect(zoom: photos[selectedIndex].zoom, center: center)
        photos[selectedIndex].center = CGPoint(x: rect.midX, y: rect.midY)
    }

    /// Recadre, prépare et ajoute les photos à la file ; `true` si l'écran peut se fermer.
    func share() async -> Bool {
        guard !photos.isEmpty, !isSharing else { return false }
        isSharing = true
        defer { isSharing = false }
        var images: [Data] = []
        for photo in photos {
            do {
                try await images.append(ImageCropper.jpegData(of: photo.image, croppedTo: cropRect(of: photo)))
            } catch {
                shareErrorMessage = UploadError.message(for: .unreadableImage)
                return false
            }
        }
        do {
            try await publisher.publish(
                images: images,
                caption: caption.trimmingCharacters(in: .whitespacesAndNewlines),
                authorId: authorId
            )
            return true
        } catch {
            shareErrorMessage = UploadError.message(for: error)
            return false
        }
    }

    private func cropRect(of photo: EditablePhoto) -> CGRect {
        ImageCropper.cropRect(imageSize: photo.size, aspectRatio: aspectRatio, zoom: photo.zoom, center: photo.center)
    }
}
