import Foundation
import Testing
@testable import CloneInstagram

@MainActor
struct MessagingShareStoreTests {
    @Test func postShareFailureKeepsItsReferenceAndClientIDForRetry() async {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        await store.share(conversationId: "conversation", postId: "post", clientId: "stable")
        #expect(store.pending.first?.sharedPostId == "post")
        #expect(store.pending.first?.state == .failed)
        service.shouldFail = false
        await store.retry(clientId: "stable")
        #expect(service.sentIDs == ["stable", "stable"])
        #expect(store.pending.isEmpty)
        #expect(store.messages["conversation"]?.first?.sharedPostId == "post")
    }

    @Test func refreshedHistoryReplacesAnUnavailablePreviewWithoutDuplicatingTheMessage() async {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let preview = SharedPostPreview(
            id: "post",
            kind: "post",
            caption: "Secret",
            author: PostAuthor(id: "author", username: "author", avatar: nil),
            thumbnail: nil
        )
        let original = ChatMessage(
            id: "1",
            conversationId: "conversation",
            senderId: "other",
            clientId: "client",
            body: "",
            createdAt: Date(),
            sharedPostId: "post",
            sharedPost: preview,
            isPostShare: true
        )
        store.receive(original)
        var unavailable = original
        unavailable.sharedPost = nil
        service.pages = [MessagePage(items: [unavailable], nextCursor: nil)]
        await store.loadHistory("conversation")
        #expect(store.messages["conversation"]?.count == 1)
        #expect(store.messages["conversation"]?.first?.sharedPost == nil)
    }

    @Test func reopeningRevalidatesReferencesInOlderDisplayedPages() async {
        let service = FakeMessagingService()
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let preview = SharedPostPreview(
            id: "post",
            kind: "post",
            caption: "Secret",
            author: PostAuthor(id: "author", username: "author", avatar: nil),
            thumbnail: nil
        )
        let original = ChatMessage(
            id: "old",
            conversationId: "conversation",
            senderId: "other",
            clientId: "client",
            body: "",
            createdAt: Date(),
            sharedPostId: "post",
            sharedPost: preview,
            isPostShare: true
        )
        store.receive(original)
        var unavailable = original
        unavailable.sharedPost = nil
        service.pages = [
            MessagePage(
                items: [ChatMessage(
                    id: "new",
                    conversationId: "conversation",
                    senderId: "other",
                    clientId: "new",
                    body: "Hello",
                    createdAt: Date()
                )],
                nextCursor: "older"
            ),
            MessagePage(items: [unavailable], nextCursor: nil),
        ]
        await store.enter("conversation")
        #expect(service.cursors.prefix(2).elementsEqual([nil, "older"]))
        #expect(store.messages["conversation"]?.first(where: { $0.id == "old" })?.sharedPost == nil)
    }
}
