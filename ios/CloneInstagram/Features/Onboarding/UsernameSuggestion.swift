import Foundation

/// Premier username proposé à partir du nom, sinon de l'email (ADR-018). L'API dit s'il est libre.
enum UsernameSuggestion {
    static func candidate(fullName: String, email: String) -> String {
        let fromName = normalize(fullName)
        if !fromName.isEmpty {
            return fromName
        }
        let fromEmail = normalize(email.split(separator: "@").first.map(String.init) ?? "")
        return fromEmail.isEmpty ? "user" : fromEmail
    }

    /// Minuscules, accents retirés, caractères hors `[a-z0-9._]` supprimés, 30 caractères au plus.
    static func normalize(_ raw: String) -> String {
        let folded = raw.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR")).lowercased()
        let allowed = folded.filter { character in
            character.isASCII && (character.isLetter || character.isNumber || character == "." || character == "_")
        }
        return String(allowed.prefix(30))
    }

    /// Même règle que le contrat : 1 à 30 caractères `[a-z0-9._]`.
    static func isValid(_ username: String) -> Bool {
        username.wholeMatch(of: /[a-z0-9._]{1,30}/) != nil
    }
}
