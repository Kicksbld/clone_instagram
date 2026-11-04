import Foundation

enum MentionParser {
    static let pattern = #"(?<![\p{L}\p{N}_.@])@([a-zA-Z0-9_.]{1,30})(?![a-zA-Z0-9_.])"#

    static func usernames(in text: String) -> Set<String> {
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
        return Set(expression.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            guard let range = Range(match.range(at: 1), in: text) else { return nil }
            return text[range].lowercased()
        })
    }
}
