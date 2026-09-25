import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Image prête à l'envoi : fichier JPEG temporaire (l'upload en arrière-plan part d'un fichier).
nonisolated struct PreparedImage: Equatable {
    let fileURL: URL
    let sizeBytes: Int
    let mimeType: String
    let width: Int
    let height: Int
}

nonisolated enum ImagePreparationError: Error, Equatable {
    /// Données illisibles comme image.
    case unreadableImage
    /// Écriture du fichier temporaire impossible.
    case writeFailed
}

/**
 Préparation avant envoi (ADR-008) : HEIC, JPEG ou PNG → JPEG de 2 160 px au plus, orientation appliquée,
 **sans aucune métadonnée** (EXIF, GPS) : la position ne quitte pas le téléphone. Le worker revérifie tout.
 */
nonisolated enum ImagePreparer {
    static let maxPixelSize = 2160
    static let compressionQuality = 0.85

    @concurrent
    static func prepare(_ data: Data, in directory: URL = defaultDirectory) async throws(ImagePreparationError) -> PreparedImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { throw .unreadableImage }

        // Miniature ImageIO : redimensionne sans agrandir, applique l'orientation EXIF, ne garde aucune métadonnée.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: min(maxPixelSize, max(width, height)),
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw .unreadableImage
        }

        let fileURL = directory.appending(path: "\(UUID().uuidString).jpg")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw .writeFailed
        }
        guard let destination = CGImageDestinationCreateWithURL(fileURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw .writeFailed
        }
        // Seule propriété écrite : la qualité de compression. Aucune métadonnée de la source n'est recopiée.
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: compressionQuality] as CFDictionary)
        guard CGImageDestinationFinalize(destination),
              let size = try? FileManager.default.attributesOfItem(atPath: fileURL.path())[.size] as? Int
        else { throw .writeFailed }

        return PreparedImage(fileURL: fileURL, sizeBytes: size, mimeType: "image/jpeg", width: image.width, height: image.height)
    }

    /// Fichiers en attente d'envoi ; supprimés une fois l'upload terminé.
    static var defaultDirectory: URL {
        FileManager.default.temporaryDirectory.appending(path: "uploads", directoryHint: .isDirectory)
    }
}
