import Foundation
import Testing
@testable import CloneInstagram

struct AuthenticationMiddlewareTests {
    @Test func `ajoute le jeton Supabase en Bearer`() async throws {
        let transport = RecordingTransport()
        let client = try APIClientFactory.makeClient(
            configuration: APIConfiguration(rawBaseURL: "http://localhost:3000"),
            transport: transport,
            accessToken: { "abc.def.ghi" }
        )

        _ = try await client.getMe()

        #expect(transport.lastRequest?.headerFields[.authorization] == "Bearer abc.def.ghi")
    }

    @Test func `sans session, aucun en-tête d'authentification`() async throws {
        let transport = RecordingTransport()
        let client = try APIClientFactory.makeClient(
            configuration: APIConfiguration(rawBaseURL: "http://localhost:3000"),
            transport: transport,
            accessToken: { nil }
        )

        _ = try await client.getMe()

        #expect(transport.lastRequest?.headerFields[.authorization] == nil)
    }
}
