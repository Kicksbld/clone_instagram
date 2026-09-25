import Foundation
import Testing
@testable import CloneInstagram

struct SupabaseConfigurationTests {
    @Test func `configuration valide`() throws {
        let configuration = try SupabaseConfiguration(rawURL: "http://192.168.1.20:54321", rawPublishableKey: "sb_publishable_x")

        #expect(configuration.url == URL(string: "http://192.168.1.20:54321"))
        #expect(configuration.publishableKey == "sb_publishable_x")
    }

    @Test(arguments: [nil, "", "localhost:54321", "$(SUPABASE_URL)"])
    func `URL invalide`(raw: String?) {
        #expect(throws: SupabaseConfigurationError.invalidURL) {
            try SupabaseConfiguration(rawURL: raw, rawPublishableKey: "sb_publishable_x")
        }
    }

    @Test(arguments: [nil, "", "$(SUPABASE_PUBLISHABLE_KEY)"])
    func `clé publique absente`(raw: String?) {
        #expect(throws: SupabaseConfigurationError.missingPublishableKey) {
            try SupabaseConfiguration(rawURL: "http://localhost:54321", rawPublishableKey: raw)
        }
    }
}
