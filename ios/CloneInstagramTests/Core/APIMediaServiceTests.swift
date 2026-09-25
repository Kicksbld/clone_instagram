import Foundation
import Testing
@testable import CloneInstagram

struct APIMediaServiceTests {
    private static let mediaId = "0199a1b2-0000-7000-9000-000000000001"
    private static let base = "http://192.168.1.20:54321/storage/v1/object/public/media-public/\(mediaId)"

    private func makeService(_ reply: StubTransport.Reply) throws -> APIMediaService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIMediaService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func json(_ status: Int, _ body: String) -> StubTransport.Reply {
        .response(status: status, contentType: "application/json", body: body)
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `intention d'upload convertie`() async throws {
        let service = try makeService(json(201, """
        {"mediaId":"\(Self.mediaId)","uploadUrl":"http://192.168.1.20:54321/storage/v1/object/upload/sign/uploads/x?token=t",\
        "expiresAt":"2026-09-25T14:00:00.000Z"}
        """))

        let intent = try await service.requestUpload(purpose: .avatar, mimeType: "image/jpeg", sizeBytes: 2048)

        #expect(intent.mediaId == Self.mediaId)
        #expect(intent.uploadURL.absoluteString.hasSuffix("uploads/x?token=t"))
        #expect(intent.expiresAt == Date(timeIntervalSince1970: 1_790_344_800))
    }

    @Test func `type non accepté par le contrat → invalidInput, sans appel`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: MediaServiceError.invalidInput) {
            try await service.requestUpload(purpose: .avatar, mimeType: "image/heic", sizeBytes: 2048)
        }
    }

    @Test func `média prêt → variantes`() async throws {
        let service = try makeService(json(200, """
        {"id":"\(Self.mediaId)","kind":"image","purpose":"avatar","status":"ready","variants":\
        {"thumb":"\(Self.base)/thumb.webp","medium":"\(Self.base)/medium.webp","large":"\(Self.base)/large.webp"}}
        """))

        let status = try await service.fetchStatus(mediaId: Self.mediaId)

        let expected = try ImageVariants(
            thumb: #require(URL(string: "\(Self.base)/thumb.webp")),
            medium: #require(URL(string: "\(Self.base)/medium.webp")),
            large: #require(URL(string: "\(Self.base)/large.webp"))
        )
        #expect(status == .ready(expected))
    }

    @Test(arguments: [
        ("invalid_image", MediaFailureReason.invalidImage),
        ("file_too_large", .fileTooLarge),
        ("processing_error", .processingError),
    ])
    func `média en échec → motif`(code: String, expected: MediaFailureReason) async throws {
        let service = try makeService(json(200, """
        {"id":"\(Self.mediaId)","kind":"image","purpose":"avatar","status":"failed","failureReason":"\(code)"}
        """))

        #expect(try await service.fetchStatus(mediaId: Self.mediaId) == .failed(expected))
    }

    @Test func `complete → statut uploaded`() async throws {
        let service = try makeService(json(200, """
        {"id":"\(Self.mediaId)","kind":"image","purpose":"avatar","status":"uploaded"}
        """))

        #expect(try await service.completeUpload(mediaId: Self.mediaId) == .uploaded)
    }

    @Test func `transition invalide → invalidTransition`() async throws {
        let service = try makeService(problem(409, "media_invalid_transition"))

        await #expect(throws: MediaServiceError.invalidTransition) { try await service.completeUpload(mediaId: Self.mediaId) }
    }

    @Test func `média d'un autre → mediaNotFound`() async throws {
        let service = try makeService(problem(404, "media_not_found"))

        await #expect(throws: MediaServiceError.mediaNotFound) { try await service.fetchStatus(mediaId: Self.mediaId) }
    }

    @Test func `réseau indisponible → unreachable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: MediaServiceError.unreachable) { try await service.fetchStatus(mediaId: Self.mediaId) }
    }
}
