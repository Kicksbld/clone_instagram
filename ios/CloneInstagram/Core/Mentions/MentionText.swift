import SwiftUI

/// Only accounts resolved by the API become links; unknown usernames stay plain text.
enum MentionText {
    static func attributed(_ text: String, mentions: [TextMention], blockedIds: Set<String> = []) -> AttributedString {
        var result = AttributedString(text)
        guard let expression = try? NSRegularExpression(pattern: MentionParser.pattern)
        else { return result }
        for match in expression.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let nameRange = Range(match.range(at: 1), in: text),
                  let fullRange = Range(match.range, in: text),
                  let user = mentions
                  .first(where: { $0.textUsername.lowercased() == text[nameRange].lowercased() && !blockedIds.contains($0.id) }),
                  let range = Range(fullRange, in: result),
                  let url = URL(string: "clone-mention://profile/\(user.username)") else { continue }
            result[range].link = url
        }
        return result
    }
}

extension EnvironmentValues {
    @Entry var mentionProfileDestination: (ProfileRoute) -> AnyView = { _ in AnyView(EmptyView()) }
}

/// Installed within each NavigationStack, including the comments sheet.
struct MentionNavigation: ViewModifier {
    @Environment(\.mentionProfileDestination) private var destination
    @State private var route: ProfileRoute?

    func body(content: Content) -> some View {
        content
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "clone-mention", url.host == "profile" else { return .systemAction }
                route = ProfileRoute(username: url.lastPathComponent)
                return .handled
            })
            .navigationDestination(item: $route) { destination($0) }
    }
}
