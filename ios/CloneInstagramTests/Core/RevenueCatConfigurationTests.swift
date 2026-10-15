import Testing
@testable import CloneInstagram

struct RevenueCatConfigurationTests {
    @Test func `clé présente → configuration`() throws {
        #expect(try RevenueCatConfiguration(rawAPIKey: "appl_test").apiKey == "appl_test")
    }

    @Test(arguments: [nil, "", "$(REVENUECAT_API_KEY)"])
    func `clé absente ou non substituée → erreur`(raw: String?) {
        #expect(throws: RevenueCatConfigurationError.missingAPIKey) { try RevenueCatConfiguration(rawAPIKey: raw) }
    }
}
