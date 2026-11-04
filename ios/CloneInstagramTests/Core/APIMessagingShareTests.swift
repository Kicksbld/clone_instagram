import Foundation
import Testing
@testable import CloneInstagram

struct APIMessagingShareTests {
    private func service(status: Int = 201, body: String, contentType: String = "application/json") throws -> APIMessagingService {
        let config = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIMessagingService(client: APIClientFactory.makeClient(
            configuration: config,
            transport: StubTransport(reply: .response(status: status, contentType: contentType, body: body))
        ))
    }

    @Test func decodesVisibleAndUnavailableSharedPostsWithoutDroppingTheMessage() async throws {
        for preview in [
            #"{"id":"post","kind":"reel","caption":"Regarde","author":{"id":"author","username":"alice"},"thumbnail":"https://cdn.test/thumb.webp"}"#,
            "null",
        ] {
            let body = """
            {"id":"message","conversationId":"conversation","senderId":"me","clientId":"client",
             "kind":"post_share","body":"","createdAt":"2026-11-01T12:00:00.000Z",
             "sharedPostId":"post","sharedPost":\(preview)}
            """
            let message = try await service(body: body).share(conversationId: "conversation", clientId: "client", postId: "post")
            #expect(message.isPostShare)
            #expect(message.sharedPostId == "post")
            if preview == "null" {
                #expect(message.sharedPost == nil)
                #expect(message.summary == "Contenu indisponible")
            } else {
                #expect(message.sharedPost?.caption == "Regarde")
                #expect(message.sharedPost?.thumbnail?.absoluteString == "https://cdn.test/thumb.webp")
            }
        }
    }

    @Test func postNotFoundDoesNotMakeTheConversationUnavailable() async throws {
        let body = #"{"type":"about:blank","title":"Not Found","status":404,"detail":"x","code":"post_not_found"}"#
        do {
            _ = try await service(status: 404, body: body, contentType: "application/problem+json").share(
                conversationId: "conversation",
                clientId: "client",
                postId: "post"
            )
            Issue.record("Expected postUnavailable")
        } catch MessagingError.postUnavailable {} catch { Issue.record("Unexpected error: \(error)") }
    }
}
