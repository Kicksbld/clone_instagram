import Foundation
import Testing
@testable import CloneInstagram

struct APIConfigurationTests {
    @Test func `URL valide`() throws {
        let configuration = try APIConfiguration(rawBaseURL: "http://192.168.1.20:3000")

        #expect(configuration.baseURL == URL(string: "http://192.168.1.20:3000"))
    }

    @Test(arguments: [nil, ""])
    func `URL absente`(raw: String?) {
        #expect(throws: APIConfigurationError.missingBaseURL) {
            try APIConfiguration(rawBaseURL: raw)
        }
    }

    @Test(arguments: ["localhost:3000", "ftp://example.com", "$(API_BASE_URL)"])
    func `URL invalide`(raw: String) {
        #expect(throws: APIConfigurationError.invalidBaseURL(raw)) {
            try APIConfiguration(rawBaseURL: raw)
        }
    }
}
