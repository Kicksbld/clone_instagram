import Foundation

/// Clé publique RevenueCat lue dans l'Info.plist (`.xcconfig` de `Local` ou `Demo`, ADR-009).
struct RevenueCatConfiguration: Equatable {
    static let apiKeyKey = "RevenueCatAPIKey"

    let apiKey: String

    init(bundle: Bundle) throws(RevenueCatConfigurationError) {
        try self.init(rawAPIKey: bundle.object(forInfoDictionaryKey: Self.apiKeyKey) as? String)
    }

    init(rawAPIKey: String?) throws(RevenueCatConfigurationError) {
        guard let rawAPIKey, !rawAPIKey.isEmpty, !rawAPIKey.hasPrefix("$(") else { throw .missingAPIKey }
        apiKey = rawAPIKey
    }
}

enum RevenueCatConfigurationError: Error, Equatable {
    case missingAPIKey
}
