import APIClient
import Foundation

struct ChatMessage: Equatable, Identifiable, Sendable {
    let id: String
    let conversationId: String
    let senderId: String
    let clientId: String
    let body: String
    let createdAt: Date
}

struct Conversation: Identifiable, Equatable, Sendable {
    let id: String
    let otherMember: PostAuthor
    let createdAt: Date
    var lastMessage: ChatMessage?
}

struct ConversationPage: Sendable {
    let items: [Conversation]
    let nextCursor: String?
}

struct MessagePage: Sendable {
    let items: [ChatMessage]
    let nextCursor: String?
}

nonisolated enum MessagingError: Error {
    case unavailable
    case notFound
    case requestFailed
}

protocol MessagingService: Sendable {
    func conversations(cursor: String?) async throws -> ConversationPage
    func open(userId: String) async throws -> Conversation
    func messages(conversationId: String, cursor: String?, after: String?) async throws -> MessagePage
    func send(conversationId: String, clientId: String, body: String) async throws -> ChatMessage
}

struct APIMessagingService: MessagingService {
    let client: any APIProtocol

    func conversations(cursor: String?) async throws -> ConversationPage {
        switch try await client.listConversations(query: .init(cursor: cursor)) {
        case let .ok(response):
            let page = try response.body.json
            return ConversationPage(items: page.items.map(Conversation.init), nextCursor: page.nextCursor)
        default: throw MessagingError.requestFailed
        }
    }

    func open(userId: String) async throws -> Conversation {
        switch try await client.getOrCreateConversation(body: .json(.init(userId: userId))) {
        case let .ok(response): return try Conversation(response.body.json)
        case let .created(response): return try Conversation(response.body.json)
        case .notFound: throw MessagingError.notFound
        default: throw MessagingError.requestFailed
        }
    }

    func messages(conversationId: String, cursor: String?, after: String?) async throws -> MessagePage {
        switch try await client.listMessages(path: .init(id: conversationId), query: .init(cursor: cursor, after: after)) {
        case let .ok(response):
            let page = try response.body.json
            return MessagePage(items: page.items.compactMap(ChatMessage.init), nextCursor: page.nextCursor)
        case .notFound: throw MessagingError.notFound
        default: throw MessagingError.requestFailed
        }
    }

    func send(conversationId: String, clientId: String, body: String) async throws -> ChatMessage {
        let response = try await client.sendMessage(
            path: .init(id: conversationId),
            body: .json(.init(clientId: clientId, kind: .text, body: body))
        )
        let dto: Components.Schemas.Message
        switch response {
        case let .ok(value): dto = try value.body.json
        case let .created(value): dto = try value.body.json
        case .notFound: throw MessagingError.notFound
        default: throw MessagingError.requestFailed
        }
        guard let message = ChatMessage(dto) else { throw MessagingError.requestFailed }
        return message
    }
}

extension ChatMessage {
    init?(_ dto: Components.Schemas.Message) {
        guard dto.kind == "text" else { return nil }
        self.init(
            id: dto.id,
            conversationId: dto.conversationId,
            senderId: dto.senderId,
            clientId: dto.clientId,
            body: dto.body,
            createdAt: dto.createdAt
        )
    }
}

private extension Conversation {
    init(_ dto: Components.Schemas.Conversation) {
        self.init(
            id: dto.id,
            otherMember: PostAuthor(
                id: dto.otherMember.id,
                username: dto.otherMember.username,
                avatar: dto.otherMember.avatar.flatMap(ImageVariants.init)
            ),
            createdAt: dto.createdAt,
            lastMessage: dto.lastMessage.flatMap(ChatMessage.init)
        )
    }
}

struct UnavailableMessagingService: MessagingService {
    func conversations(cursor _: String?) async throws -> ConversationPage {
        throw MessagingError.unavailable
    }

    func open(userId _: String) async throws -> Conversation {
        throw MessagingError.unavailable
    }

    func messages(
        conversationId _: String,
        cursor _: String?,
        after _: String?
    ) async throws -> MessagePage {
        throw MessagingError.unavailable
    }

    func send(conversationId _: String, clientId _: String, body _: String) async throws -> ChatMessage {
        throw MessagingError.unavailable
    }
}
