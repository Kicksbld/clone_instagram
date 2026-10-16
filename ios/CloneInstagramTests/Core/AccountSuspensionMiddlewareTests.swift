import APIClient
import Foundation
import Testing
@testable import CloneInstagram

struct AccountSuspensionMiddlewareTests {
    private actor Signals {
        private(set) var received = 0
        func record() {
            received += 1
        }
    }

    private func problem(status: Int, code: String) -> String {
        #"{"type":"about:blank","title":"Forbidden","status":\#(status),"detail":"x","code":"\#(code)"}"#
    }

    private func client(replying reply: StubTransport.Reply, signals: Signals) throws -> Client {
        try APIClientFactory.makeClient(
            configuration: APIConfiguration(rawBaseURL: "http://localhost:3000"),
            transport: StubTransport(reply: reply),
            onAccountSuspended: { await signals.record() }
        )
    }

    @Test func `refus account_suspended → signalé, réponse inchangée`() async throws {
        let signals = Signals()
        let client = try client(
            replying: .response(
                status: 403,
                contentType: "application/problem+json",
                body: problem(status: 403, code: "account_suspended")
            ),
            signals: signals
        )

        let output = try await client.getFeed()

        #expect(await signals.received == 1)
        guard case .undocumented(statusCode: 403, _) = output else {
            Issue.record("Réponse inattendue : \(output)")
            return
        }
    }

    @Test(arguments: [(403, "account_private"), (404, "user_not_found")])
    func `autre refus → rien n'est signalé`(status: Int, code: String) async throws {
        let signals = Signals()
        let client = try client(
            replying: .response(
                status: status,
                contentType: "application/problem+json",
                body: problem(status: status, code: code)
            ),
            signals: signals
        )

        _ = try await client.getFeed()

        #expect(await signals.received == 0)
    }

    @Test func `corps illisible → rien n'est signalé`() {
        #expect(!AccountSuspensionMiddleware.isAccountSuspended(Data("pas du json".utf8)))
    }
}
