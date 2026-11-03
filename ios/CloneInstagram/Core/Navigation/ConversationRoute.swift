import Foundation

/// App resolves this route, keeping Profile independent of Messages.
struct ConversationRoute: Hashable {
    let userId: String
    let username: String
}
