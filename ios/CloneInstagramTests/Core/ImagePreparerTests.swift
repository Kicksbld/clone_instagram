import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CloneInstagram

struct ImagePreparerTests {
    private let directory = FileManager.default.temporaryDirectory.appending(path: "image-preparer-tests-\(UUID().uuidString)")

    /// Photo d'iPhone simulée : position GPS, modèle de l'appareil, orientation 6 (prise en portrait).
    private func photo(width: Int, height: Int, type: UTType = .jpeg, orientation: Int = 6) throws -> Data {
        let context = try #require(CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ))
        context.setFillColor(red: 0.2, green: 0.6, blue: 0.4, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try #require(context.makeImage())

        let data = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil))
        let properties: [CFString: Any] = [
            kCGImagePropertyOrientation: orientation,
            kCGImagePropertyGPSDictionary: [
                kCGImagePropertyGPSLatitude: 48.8566,
                kCGImagePropertyGPSLatitudeRef: "N",
                kCGImagePropertyGPSLongitude: 2.3522,
                kCGImagePropertyGPSLongitudeRef: "E",
            ],
            kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFModel: "iPhone 17"],
        ]
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        try #require(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private func properties(of url: URL) throws -> [CFString: Any] {
        let source = try #require(CGImageSourceCreateWithURL(url as CFURL, nil))
        return try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }

    @Test func `photo avec GPS → JPEG de 2 160 px au plus, orienté, sans aucune métadonnée`() async throws {
        let original = try photo(width: 4000, height: 3000)
        let source = try #require(CGImageSourceCreateWithData(original as CFData, nil))
        let originalProperties = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        #expect(originalProperties[kCGImagePropertyGPSDictionary] != nil)

        let prepared = try await ImagePreparer.prepare(original, in: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        #expect(prepared.mimeType == "image/jpeg")
        // Orientation 6 appliquée : portrait.
        #expect(prepared.width == 1620)
        #expect(prepared.height == 2160)
        let output = try properties(of: prepared.fileURL)
        #expect(output[kCGImagePropertyGPSDictionary] == nil)
        #expect(output[kCGImagePropertyTIFFDictionary] == nil)
        #expect((output[kCGImagePropertyOrientation] as? Int ?? 1) == 1)
        let bytes = try Data(contentsOf: prepared.fileURL)
        #expect(bytes.count == prepared.sizeBytes)
        #expect(bytes.range(of: Data("iPhone 17".utf8)) == nil)
    }

    /// Régression T6a : la file de publication prépare dans « Application Support », chemin avec une espace.
    @Test func `dossier dont le chemin contient une espace`() async throws {
        let directory = directory.appending(path: "Application Support")
        defer { try? FileManager.default.removeItem(at: self.directory) }

        let prepared = try await ImagePreparer.prepare(photo(width: 400, height: 300), in: directory)

        #expect(prepared.sizeBytes == (try Data(contentsOf: prepared.fileURL)).count)
    }

    @Test func `HEIC converti en JPEG`() async throws {
        let original = try photo(width: 1200, height: 900, type: .heic, orientation: 1)

        let prepared = try await ImagePreparer.prepare(original, in: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let source = try #require(CGImageSourceCreateWithURL(prepared.fileURL as CFURL, nil))
        #expect(CGImageSourceGetType(source) as String? == UTType.jpeg.identifier)
        #expect(prepared.width == 1200)
        #expect(try properties(of: prepared.fileURL)[kCGImagePropertyGPSDictionary] == nil)
    }

    @Test func `petite image jamais agrandie`() async throws {
        let prepared = try await ImagePreparer.prepare(photo(width: 300, height: 200, type: .png, orientation: 1), in: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        #expect(prepared.width == 300)
        #expect(prepared.height == 200)
    }

    @Test func `données qui ne sont pas une image → illisible`() async {
        await #expect(throws: ImagePreparationError.unreadableImage) {
            try await ImagePreparer.prepare(Data("pas une image".utf8), in: directory)
        }
    }
}
