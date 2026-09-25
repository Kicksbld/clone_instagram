import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CloneInstagram

struct ImageCropperTests {
    /// (ratio de la photo, ratio du cadre attendu).
    private nonisolated static let ratios: [(Double, Double)] = [
        (4.0 / 3.0, 4.0 / 3.0), // paysage 4:3 : gardé
        (0.75, 0.75), // portrait 3:4 (appareil photo) : gardé
        (9.0 / 16.0, 0.75), // capture d'écran : ramenée à 3:4
        (3.0, 1.91), // panorama : ramené à 1.91:1
    ]

    @Test(arguments: ratios)
    func `ratio d'origine borné entre 3:4 et 1.91:1`(ratio: Double, expected: Double) {
        #expect(abs(ImageCropper.clampedAspectRatio(ratio) - expected) < 0.0001)
    }

    @Test func `carré dans un portrait : toute la largeur, centré`() {
        let rect = ImageCropper.cropRect(
            imageSize: CGSize(width: 3000, height: 4000),
            aspectRatio: 1,
            zoom: 1,
            center: CGPoint(x: 1500, y: 2000)
        )

        #expect(rect == CGRect(x: 0, y: 500, width: 3000, height: 3000))
    }

    @Test func `carré dans un paysage : toute la hauteur`() {
        let rect = ImageCropper.cropRect(
            imageSize: CGSize(width: 4000, height: 3000),
            aspectRatio: 1,
            zoom: 1,
            center: CGPoint(x: 2000, y: 1500)
        )

        #expect(rect == CGRect(x: 500, y: 0, width: 3000, height: 3000))
    }

    @Test func `zoom ×2 : zone deux fois plus petite`() {
        let rect = ImageCropper.cropRect(
            imageSize: CGSize(width: 3000, height: 4000),
            aspectRatio: 3.0 / 4.0,
            zoom: 2,
            center: CGPoint(x: 1500, y: 2000)
        )

        #expect(rect == CGRect(x: 750, y: 1000, width: 1500, height: 2000))
    }

    @Test func `centre hors de la photo : zone ramenée dans la photo`() {
        let rect = ImageCropper.cropRect(
            imageSize: CGSize(width: 3000, height: 4000),
            aspectRatio: 1,
            zoom: 2,
            center: CGPoint(x: -500, y: 9000)
        )

        #expect(rect == CGRect(x: 0, y: 2500, width: 1500, height: 1500))
    }

    @Test func `zoom borné entre 1 et 5`() {
        let size = CGSize(width: 1000, height: 1000)
        let center = CGPoint(x: 500, y: 500)

        #expect(ImageCropper.cropRect(imageSize: size, aspectRatio: 1, zoom: 0.2, center: center).width == 1000)
        #expect(ImageCropper.cropRect(imageSize: size, aspectRatio: 1, zoom: 50, center: center).width == 200)
    }

    @Test func `recadrage encodé en JPEG aux dimensions de la zone`() async throws {
        let image = try #require(Self.image(width: 400, height: 300))

        let data = try await ImageCropper.jpegData(of: image, croppedTo: CGRect(x: 50, y: 0, width: 300, height: 300))

        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        #expect(CGImageSourceGetType(source) as String? == UTType.jpeg.identifier)
        let properties = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        #expect(properties[kCGImagePropertyPixelWidth] as? Int == 300)
        #expect(properties[kCGImagePropertyPixelHeight] as? Int == 300)
    }

    @Test func `données illisibles → unreadableImage`() async {
        await #expect(throws: ImagePreparationError.unreadableImage) {
            try await ImageCropper.editableImage(from: Data("pas une image".utf8))
        }
    }

    nonisolated static func image(width: Int, height: Int) -> CGImage? {
        let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
        context?.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1))
        context?.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context?.makeImage()
    }
}
