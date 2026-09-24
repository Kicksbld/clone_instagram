import Foundation

/// URL de l'API lue dans l'Info.plist, alimentée par le `.xcconfig` de la configuration `Local` ou `Demo` (ADR-009).
struct APIConfiguration: Equatable {
    static let baseURLKey = "APIBaseURL"

    let baseURL: URL

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    init(bundle: Bundle) throws(APIConfigurationError) {
        try self.init(rawBaseURL: bundle.object(forInfoDictionaryKey: Self.baseURLKey) as? String)
    }

    init(rawBaseURL: String?) throws(APIConfigurationError) {
        guard let rawBaseURL, !rawBaseURL.isEmpty else { throw .missingBaseURL }
        guard
            let url = URL(string: rawBaseURL),
            let scheme = url.scheme, ["http", "https"].contains(scheme),
            url.host() != nil
        else { throw .invalidBaseURL(rawBaseURL) }
        baseURL = url
    }
}

enum APIConfigurationError: Error, Equatable {
    case missingBaseURL
    case invalidBaseURL(String)
}
