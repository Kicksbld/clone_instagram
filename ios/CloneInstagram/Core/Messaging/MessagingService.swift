import APIClient
import Foundation

struct SharedPostPreview: Equatable, Sendable {
    let id: String
    let kind: String
    let caption: String
    let author: PostAuthor
    let thumbnail: URL?
}

struct ChatMessage: Equatable, Identifiable, Sendable {
    let id: String
    let conversationId: String
    let senderId: String
    let clientId: String
    /// Empty for a photo sent without text.
    let body: String
    let createdAt: Date
    /// Photo of an `image` message, displayed through a signed URL (ADR-023).
    var mediaId: String?
    var sharedPostId: String?
    var sharedPost: SharedPostPreview?
    var isPostShare = false

    /// Inbox preview: the text, or « Photo » for a photo without text.
    var summary: String {
        if isPostShare {
            return sharedPost == nil ? "Contenu indisponible" : (body.isEmpty ? "Post partagé" : body)
        }
        return mediaId != nil && body.isEmpty ? "Photo" : body
    }
}

/// Variant of a message photo (ADR-008).
nonisolated enum PhotoVariant: String, Sendable {
    case thumb, medium, large
}

/// Signed URL of a message photo, valid for one hour (ADR-023).
struct SignedPhotoURL: Equatable, Sendable {
    let url: URL
    let expiresAt: Date
}

struct Conversation: Identifiable, Equatable, Sendable {
    let id: String
    let otherMember: PostAuthor
    let createdAt: Date
    var lastMessage: ChatMessage?
    /// Messages of the other member I have not read yet (ADR-023).
    var unreadCount = 0
    /// The other member's read position: « Vu » under my latest message up to it.
    var otherMemberLastReadMessageId: String?
}

struct ConversationPage: Sendable {
    let items: [Conversation]
    let nextCursor: String?
    /// Unread conversations across all pages: Messages tab badge.
    var unreadConversationCount = 0
}

struct MessagePage: Sendable {
    let items: [ChatMessage]
    let nextCursor: String?
}

nonisolated enum MessagingError: Error {
    case unavailable
    case notFound
    case requestFailed
    /// The shared post has disappeared or is no longer visible to me.
    case postUnavailable
    /// The photo cannot be attached (not ready, already used, wrong kind…): upload it again.
    case photoRejected
}

protocol MessagingService: Sendable {
    func conversations(cursor: String?) async throws -> ConversationPage
    func open(userId: String) async throws -> Conversation
    func messages(conversationId: String, cursor: String?, after: String?) async throws -> MessagePage
    func send(conversationId: String, clientId: String, body: String) async throws -> ChatMessage
    /// Sends a `ready` photo of purpose `message` (ADR-023), same `clientId` for every retry.
    func sendPhoto(conversationId: String, clientId: String, mediaId: String) async throws -> ChatMessage
    func share(conversationId: String, clientId: String, postId: String) async throws -> ChatMessage
    /// Signed URL of a message photo; `notFound` outside my visible conversations.
    func photoURL(mediaId: String, variant: PhotoVariant) async throws -> SignedPhotoURL
    func markRead(conversationId: String, messageId: String) async throws
}

struct APIMessagingService: MessagingService {
    let client: any APIProtocol

    func conversations(cursor: String?) async throws -> ConversationPage {
        switch try await client.listConversations(query: .init(cursor: cursor)) {
        case let .ok(response):
            let page = try response.body.json
            return ConversationPage(
                items: page.items.map(Conversation.init),
                nextCursor: page.nextCursor,
                unreadConversationCount: max(0, page.unreadConversationCount)
            )
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
        try await send(conversationId: conversationId, .SendTextMessage(.init(clientId: clientId, kind: .text, body: body)))
    }

    func sendPhoto(conversationId: String, clientId: String, mediaId: String) async throws -> ChatMessage {
        try await send(
            conversationId: conversationId,
            .SendImageMessage(.init(clientId: clientId, kind: .image, mediaId: mediaId))
        )
    }

    func share(conversationId: String, clientId: String, postId: String) async throws -> ChatMessage {
        try await send(
            conversationId: conversationId,
            .SendPostShareMessage(.init(clientId: clientId, kind: .postShare, sharedPostId: postId))
        )
    }

    private func send(
        conversationId: String,
        _ body: Operations.SendMessage.Input.Body.JsonPayload
    ) async throws -> ChatMessage {
        let response = try await client.sendMessage(path: .init(id: conversationId), body: .json(body))
        let dto: Components.Schemas.Message
        switch response {
        case let .ok(value): dto = try value.body.json
        case let .created(value): dto = try value.body.json
        case let .notFound(value):
            // 404 for the photo (`media_not_found`) is not a missing conversation.
            if case let .applicationProblemJson(problem) = value.body, problem.code == "media_not_found" {
                throw MessagingError.photoRejected
            }
            if case let .applicationProblemJson(problem) = value.body, problem.code == "post_not_found" {
                throw MessagingError.postUnavailable
            }
            throw MessagingError.notFound
        case .conflict, .unprocessableContent: throw MessagingError.photoRejected
        default: throw MessagingError.requestFailed
        }
        guard let message = ChatMessage(dto) else { throw MessagingError.requestFailed }
        return message
    }

    func photoURL(mediaId: String, variant: PhotoVariant) async throws -> SignedPhotoURL {
        let variant: Components.Schemas.ImageVariantName = switch variant {
        case .thumb: .thumb
        case .medium: .medium
        case .large: .large
        }
        switch try await client.getMediaSignedUrl(path: .init(id: mediaId), query: .init(variant: variant)) {
        case let .ok(response):
            let signed = try response.body.json
            guard let url = URL(string: signed.url) else { throw MessagingError.requestFailed }
            return SignedPhotoURL(url: url, expiresAt: signed.expiresAt)
        case .notFound: throw MessagingError.notFound
        default: throw MessagingError.requestFailed
        }
    }

    func markRead(conversationId: String, messageId: String) async throws {
        switch try await client.markConversationRead(path: .init(id: conversationId), body: .json(.init(messageId: messageId))) {
        case .noContent: return
        case .notFound: throw MessagingError.notFound
        default: throw MessagingError.requestFailed
        }
    }
}

extension ChatMessage {
    init?(_ dto: Components.Schemas.Message) {
        // Kinds of later slices are ignored; a photo always carries its media.
        switch dto.kind {
        case "text", "post_share": break
        case "image" where dto.mediaId != nil: break
        default: return nil
        }
        self.init(
            id: dto.id,
            conversationId: dto.conversationId,
            senderId: dto.senderId,
            clientId: dto.clientId,
            body: dto.body,
            createdAt: dto.createdAt,
            mediaId: dto.kind == "image" ? dto.mediaId : nil,
            sharedPostId: dto.sharedPostId,
            sharedPost: dto.sharedPost.map { preview in
                SharedPostPreview(
                    id: preview.id,
                    kind: preview.kind,
                    caption: preview.caption,
                    author: PostAuthor(id: preview.author.id, username: preview.author.username, avatar: nil),
                    thumbnail: preview.thumbnail.flatMap(URL.init(string:))
                )
            },
            isPostShare: dto.kind == "post_share"
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
            lastMessage: dto.lastMessage.flatMap(ChatMessage.init),
            unreadCount: max(0, dto.unreadCount),
            otherMemberLastReadMessageId: dto.otherMemberLastReadMessageId
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

    func sendPhoto(conversationId _: String, clientId _: String, mediaId _: String) async throws -> ChatMessage {
        throw MessagingError.unavailable
    }

    func share(conversationId _: String, clientId _: String, postId _: String) async throws -> ChatMessage {
        throw MessagingError.unavailable
    }

    func photoURL(mediaId _: String, variant _: PhotoVariant) async throws -> SignedPhotoURL {
        throw MessagingError.unavailable
    }

    func markRead(conversationId _: String, messageId _: String) async throws {
        throw MessagingError.unavailable
    }
}
