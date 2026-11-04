import Foundation
import Testing
@testable import CloneInstagram

@MainActor
struct SharePostViewModelTests {
    @Test func searchExcludesMeAndSelectionCanBeToggled() async {
        let social = FakeSocialService()
        social.searchResults = [.success([.fixture(id: "me"), .fixture(id: "friend")])]
        let model = SharePostViewModel(
            postId: "post",
            store: MessagingStore(service: FakeMessagingService()),
            social: social,
            viewerId: "me"
        )
        model.discovery.query = "friend"
        await model.discovery.search()
        #expect(model.discovery.results.map(\.id) == ["friend"])
        let user = PostAuthor(id: "friend", username: "friend", avatar: nil)
        model.toggle(user)
        #expect(model.selected == [user])
        model.toggle(user)
        #expect(model.selected.isEmpty)
    }

    @Test func allRecipientsShowSendingBeforeTheFirstResponseAndRapidSendDoesNotDuplicate() async {
        let service = FakeMessagingService()
        service.shouldFail = false
        service.holdSend = true
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let model = SharePostViewModel(postId: "post", store: store, social: FakeSocialService(), viewerId: "me")
        model.toggle(PostAuthor(id: "one", username: "one", avatar: nil))
        model.toggle(PostAuthor(id: "two", username: "two", avatar: nil))
        let task = Task { await model.send() }
        while service.continuation == nil {
            await Task.yield()
        }
        #expect(model.attempts.count == 2)
        #expect(model.attempts.values.allSatisfy { $0.state == .sending })
        #expect(store.pending.first?.sharedPostId == "post")
        await model.send()
        #expect(service.sentIDs.count == 1)
        // A session change must stop the remaining recipients as well as the late response.
        store.setAccount("other")
        service.continuation?.resume()
        await task.value
        #expect(service.sentIDs.count == 1)
        #expect(store.messages.isEmpty)
    }

    @Test func selectedRecipientsHaveDistinctStableIDsAndFailuresCanBeRetriedIndependently() async throws {
        let service = FakeMessagingService()
        service.openFailsFor = ["blocked"]
        service.shouldFail = false
        let store = MessagingStore(service: service)
        store.setAccount("me")
        let model = SharePostViewModel(postId: "post", store: store, social: FakeSocialService(), viewerId: "me")
        model.toggle(PostAuthor(id: "blocked", username: "blocked", avatar: nil))
        model.toggle(PostAuthor(id: "friend", username: "friend", avatar: nil))
        await model.send()
        #expect(model.attempts["blocked"]?.state == .failed)
        #expect(model.attempts["friend"]?.state == .sent)
        let failedID = try #require(model.attempts["blocked"]?.clientId)
        let sentID = try #require(model.attempts["friend"]?.clientId)
        #expect(failedID != sentID)
        service.openFailsFor = []
        await model.retry(userId: "blocked")
        #expect(model.attempts["blocked"]?.clientId == failedID)
        #expect(model.attempts["blocked"]?.state == .sent)
        #expect(service.sentIDs == [sentID, failedID])
    }
}
