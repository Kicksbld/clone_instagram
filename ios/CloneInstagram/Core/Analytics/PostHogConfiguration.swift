import Foundation

/// Clé projet et hôte PostHog lus dans l'Info.plist (`.xcconfig` de `Local` ou `Demo`, ADR-009, ADR-010).
struct PostHogConfiguration: Equatable {
    static let apiKeyKey = "PostHogAPIKey"
    static let hostKey = "PostHogHost"
    /// Région UE (vérifié en T1).
    static let defaultHost = "https://eu.i.posthog.com"

    let apiKey: String
    let host: String

    init(bundle: Bundle) throws(PostHogConfigurationError) {
        try self.init(
            rawAPIKey: bundle.object(forInfoDictionaryKey: Self.apiKeyKey) as? String,
            rawHost: bundle.object(forInfoDictionaryKey: Self.hostKey) as? String
        )
    }

    init(rawAPIKey: String?, rawHost: String?) throws(PostHogConfigurationError) {
        guard let rawAPIKey, !rawAPIKey.isEmpty, !rawAPIKey.hasPrefix("$(") else { throw .missingAPIKey }
        apiKey = rawAPIKey
        if let rawHost, !rawHost.isEmpty, !rawHost.hasPrefix("$(") {
            guard let url = URL(string: rawHost), url.scheme == "https", url.host() != nil else { throw .invalidHost }
            host = rawHost
        } else {
            host = Self.defaultHost
        }
    }
}

enum PostHogConfigurationError: Error, Equatable {
    case missingAPIKey
    case invalidHost
}
