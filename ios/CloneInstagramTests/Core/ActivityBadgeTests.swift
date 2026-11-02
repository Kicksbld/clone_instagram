import Testing
@testable import CloneInstagram

struct ActivityBadgeTests {
    private let service = FakeActivityService()

    @Test func `rechargée par l'API, puis remise à zéro à l'ouverture de l'Activité`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 3))]
        let badge = ActivityBadge(service: service)

        await badge.refresh()
        #expect(badge.unreadCount == 3)
        badge.cleared()

        #expect(badge.unreadCount == 0)
    }

    @Test func `API injoignable : le dernier nombre connu reste affiché`() async {
        service.fetchResults = [
            .success(ActivityPage(items: [], nextCursor: nil, unreadCount: 2)),
            .failure(.unreachable),
        ]
        let badge = ActivityBadge(service: service)

        await badge.refresh()
        await badge.refresh()

        #expect(badge.unreadCount == 2)
    }

    @Test func `a stale REST response cannot overwrite a realtime count`() async {
        let service = DelayedActivityService()
        let badge = ActivityBadge(service: service)
        let refresh = Task { await badge.refresh() }
        for _ in 0 ..< 1000 {
            if service.pending != nil {
                break
            }
            await Task.yield()
        }
        badge.received(unreadCount: 5)
        service.pending?.resume(returning: ActivityPage(items: [], nextCursor: nil, unreadCount: 1))
        service.pending = nil
        await refresh.value
        #expect(badge.unreadCount == 5)
    }
}

private final class DelayedActivityService: ActivityService {
    var pending: CheckedContinuation<ActivityPage, Never>?
    func fetchActivity(cursor _: String?) async throws(ActivityServiceError) -> ActivityPage {
        await withCheckedContinuation { pending = $0 }
    }

    func markAllRead() async throws(ActivityServiceError) {}
}
