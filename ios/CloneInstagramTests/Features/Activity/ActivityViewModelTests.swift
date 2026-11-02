import Foundation
import Testing
@testable import CloneInstagram

struct ActivityViewModelTests {
    /// Mercredi 23 septembre 2026, 12 h (UTC).
    private static let now = Date(timeIntervalSince1970: 1_790_164_800)
    private let service = FakeActivityService()
    private let badge: ActivityBadge

    init() {
        badge = ActivityBadge(service: service)
    }

    private func makeViewModel() -> ActivityViewModel {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        return ActivityViewModel(service: service, badge: badge, now: { Self.now }, calendar: calendar)
    }

    private func daysAgo(_ days: Double) -> Date {
        Self.now.addingTimeInterval(-days * 24 * 60 * 60)
    }

    @Test func `sections Aujourd'hui, Cette semaine, Ce mois-ci, Plus ancien ; sections vides absentes`() async {
        let page = ActivityPage(
            items: [
                .fixture(id: "a", createdAt: daysAgo(0.1)),
                .fixture(id: "b", createdAt: daysAgo(3)),
                .fixture(id: "c", createdAt: daysAgo(6)),
                .fixture(id: "d", createdAt: daysAgo(90)),
            ],
            nextCursor: nil,
            unreadCount: 4
        )
        service.fetchResults = [.success(page)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.sections.map(\.period) == [.today, .thisWeek, .older])
        #expect(viewModel.sections.map { $0.groups.map(\.id) } == [["a"], ["b", "c"], ["d"]])
        #expect(ActivityViewModel.Period.allCases.map(\.title) == [
            "Aujourd'hui", "Cette semaine", "Ce mois-ci", "Plus ancien",
        ])
    }

    @Test func `ouverture : chargée, puis tout marqué comme lu et pastille remise à zéro`() async {
        service.fetchResults = [
            .success(ActivityPage(items: [], nextCursor: nil, unreadCount: 2)),
            .success(ActivityPage(items: [.fixture(id: "a")], nextCursor: nil, unreadCount: 2)),
        ]
        await badge.refresh()
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(service.markReadCount == 1)
        #expect(badge.unreadCount == 0)
    }

    @Test func `échec du marquage comme lu : l'Activité reste affichée, la pastille aussi`() async {
        service.fetchResults = [
            .success(ActivityPage(items: [], nextCursor: nil, unreadCount: 1)),
            .success(ActivityPage(items: [.fixture(id: "a")], nextCursor: nil, unreadCount: 1)),
        ]
        service.markReadErrors = [.unreachable]
        await badge.refresh()
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(badge.unreadCount == 1)
    }

    @Test func `erreur, puis réessai`() async {
        service.fetchResults = [
            .failure(.unreachable),
            .success(ActivityPage(items: [.fixture(id: "a")], nextCursor: nil, unreadCount: 1)),
        ]
        let viewModel = makeViewModel()

        await viewModel.load()
        guard case .failed = viewModel.state else {
            Issue.record("erreur attendue")
            return
        }
        #expect(service.markReadCount == 0)
        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.sections.count == 1)
    }

    @Test func `page suivante avec le curseur, sans doublon`() async {
        service.fetchResults = [
            .success(ActivityPage(items: [.fixture(id: "a"), .fixture(id: "b")], nextCursor: "c1", unreadCount: 0)),
            .success(ActivityPage(items: [.fixture(id: "b"), .fixture(id: "c")], nextCursor: nil, unreadCount: 0)),
        ]
        let viewModel = makeViewModel()

        await viewModel.load()
        #expect(viewModel.hasMore)
        await viewModel.loadMore()
        await viewModel.loadMore()

        #expect(viewModel.sections.flatMap { $0.groups.map(\.id) } == ["a", "b", "c"])
        #expect(service.fetchCursors == [nil, "c1"])
        #expect(!viewModel.hasMore)
    }

    @Test func `page suivante en échec : signalée, réessayable`() async {
        service.fetchResults = [
            .success(ActivityPage(items: [.fixture(id: "a")], nextCursor: "c1", unreadCount: 0)),
            .failure(.unreachable),
        ]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.loadMore()

        #expect(viewModel.loadMoreFailed)
        #expect(viewModel.hasMore)
    }

    @Test(arguments: [
        (ActivityGroup.Kind.like, 1, "lea a aimé votre publication."),
        (.like, 2, "lea et 1 autre ont aimé votre publication."),
        (.like, 5, "lea et 4 autres ont aimé votre publication."),
        (.follow, 1, "lea a commencé à vous suivre."),
    ])
    func `phrase de la notification`(kind: ActivityGroup.Kind, actorCount: Int, expected: String) {
        #expect(ActivityViewModel.message(for: .fixture(id: "a", kind: kind, actorCount: actorCount)) == expected)
    }

    @Test func `phrase d'un commentaire et d'une réponse, avec leur texte`() {
        let comment = ActivityGroup(
            id: "c", kind: .comment, actor: PostAuthor(id: "u", username: "lea", avatar: nil), actorCount: 1,
            createdAt: Self.now, isRead: false, post: nil, comment: .init(id: "c1", body: "Superbe")
        )
        let reply = ActivityGroup(
            id: "r", kind: .commentReply, actor: comment.actor, actorCount: 1,
            createdAt: Self.now, isRead: false, post: nil, comment: .init(id: "c2", body: "Merci")
        )

        #expect(ActivityViewModel.message(for: comment) == "lea a commenté : Superbe")
        #expect(ActivityViewModel.message(for: reply) == "lea a répondu à votre commentaire : Merci")
    }

    @Test func `un appui ouvre le post, ou le profil pour un abonnement`() {
        #expect(ActivityViewModel.destination(for: .fixture(id: "a", kind: .like, postId: "p1")) == .post(PostRoute(postId: "p1")))
        #expect(ActivityViewModel.destination(for: .fixture(id: "b", kind: .follow)) == .profile(ProfileRoute(username: "lea")))
    }
}
