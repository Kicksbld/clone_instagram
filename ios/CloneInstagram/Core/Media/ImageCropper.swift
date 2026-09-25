import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/**
 Recadrage d'une photo de post, comme Instagram : cadre carré (1:1) ou au ratio d'origine, borné entre
 3:4 (portrait) et 1.91:1 (paysage) ; zoom et déplacement dans le cadre. Le résultat passe ensuite par
 `ImagePreparer` (2 160 px au plus, sans métadonnées).
 */
nonisolated enum ImageCropper {
    /// Portrait le plus haut accepté (largeur / hauteur).
    static let minAspectRatio = 3.0 / 4.0
    /// Paysage le plus large accepté.
    static let maxAspectRatio = 1.91
    static let maxZoom = 5.0
    /// Taille de l'image décodée pour le recadrage : assez de détail après un zoom modéré.
    static let editingMaxPixelSize = 3240

    /// Ratio du cadre « d'origine » : celui de la photo, ramené dans les bornes d'Instagram.
    static func clampedAspectRatio(_ aspectRatio: Double) -> Double {
        min(max(aspectRatio, minAspectRatio), maxAspectRatio)
    }

    /**
     Zone gardée, en pixels de l'image : le plus grand rectangle au ratio `aspectRatio` qui tient dans
     l'image, divisé par `zoom`, centré au plus près de `center` sans sortir de l'image.
     */
    static func cropRect(imageSize: CGSize, aspectRatio: Double, zoom: Double, center: CGPoint) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0, aspectRatio > 0 else { return .zero }
        let zoom = min(max(zoom, 1), maxZoom)
        var size = if imageSize.width / imageSize.height > aspectRatio {
            CGSize(width: imageSize.height * aspectRatio, height: imageSize.height)
        } else {
            CGSize(width: imageSize.width, height: imageSize.width / aspectRatio)
        }
        size = CGSize(width: size.width / zoom, height: size.height / zoom)
        let origin = CGPoint(
            x: min(max(center.x - size.width / 2, 0), imageSize.width - size.width),
            y: min(max(center.y - size.height / 2, 0), imageSize.height - size.height)
        )
        return CGRect(origin: origin, size: size)
    }

    /// Photo décodée pour le recadrage : orientation EXIF appliquée, `editingMaxPixelSize` au plus.
    @concurrent
    static func editableImage(from data: Data) async throws(ImagePreparationError) -> CGImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0
        else { throw .unreadableImage }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: editingMaxPixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw .unreadableImage
        }
        return image
    }

    /// Zone recadrée encodée en JPEG de haute qualité, sans métadonnées, avant `ImagePreparer`.
    @concurrent
    static func jpegData(of image: CGImage, croppedTo rect: CGRect) async throws(ImagePreparationError) -> Data {
        guard let cropped = image.cropping(to: rect.integral) else { throw .unreadableImage }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil)
        else { throw .writeFailed }
        CGImageDestinationAddImage(destination, cropped, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw .writeFailed }
        return data as Data
    }
}
