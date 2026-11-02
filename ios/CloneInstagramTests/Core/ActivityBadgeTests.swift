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
}
