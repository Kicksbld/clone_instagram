import Foundation

/// URL et clé publique de Supabase Auth, lues dans l'Info.plist (`.xcconfig` de `Local` ou `Demo`, ADR-009).
struct SupabaseConfiguration: Equatable {
    static let urlKey = "SupabaseURL"
    static let publishableKeyKey = "SupabasePublishableKey"

    let url: URL
    let publishableKey: String

    init(bundle: Bundle) throws(SupabaseConfigurationError) {
        try self.init(
            rawURL: bundle.object(forInfoDictionaryKey: Self.urlKey) as? String,
            rawPublishableKey: bundle.object(forInfoDictionaryKey: Self.publishableKeyKey) as? String
        )
    }

    init(rawURL: String?, rawPublishableKey: String?) throws(SupabaseConfigurationError) {
        guard
            let rawURL, let url = URL(string: rawURL),
            let scheme = url.scheme, ["http", "https"].contains(scheme),
            url.host() != nil
        else { throw .invalidURL }
        guard let rawPublishableKey, !rawPublishableKey.isEmpty, !rawPublishableKey.hasPrefix("$(") else {
            throw .missingPublishableKey
        }
        self.url = url
        publishableKey = rawPublishableKey
    }
}

enum SupabaseConfigurationError: Error, Equatable {
    case invalidURL
    case missingPublishableKey
}
