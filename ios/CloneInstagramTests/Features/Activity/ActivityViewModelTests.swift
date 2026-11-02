import Foundation
import Testing
@testable import CloneInstagram

struct ActivityViewModelTests {
    /// Mercredi 23 septembre 2026, 12 h (UTC).
    private static let now = Date(timeIntervalSince1970: 1_790_164_800)
    private let service = FakeActivityService()
    private let social = FakeSocialService()
    private let badge: ActivityBadge

    init() {
        badge = ActivityBadge(service: service)
    }

    private func makeViewModel() -> ActivityViewModel {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        return ActivityViewModel(service: service, social: social, badge: badge, now: { Self.now }, calendar: calendar)
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

    // MARK: - Demandes d'abonnement (T20)

    private func requester(_ index: Int) -> UserSummary {
        .fixture(id: "r\(index)", username: "demandeur\(index)")
    }

    @Test func `demandes en tête : section « Demandes d'abonnement (N) », sans ligne de type demande`() async {
        let page = ActivityPage(
            items: [
                .fixture(id: "follow_request:1", kind: .followRequest, createdAt: daysAgo(0.1)),
                .fixture(id: "follow_accepted:2", kind: .followAccepted, createdAt: daysAgo(0.2)),
            ],
            nextCursor: nil,
            unreadCount: 2
        )
        service.fetchResults = [.success(page)]
        social.followRequestResults = [.success(UserPage(items: [requester(1), requester(2)], nextCursor: "c1"))]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.showsFollowRequests)
        #expect(viewModel.followRequests.map(\.id) == ["r1", "r2"])
        #expect(viewModel.followRequestsTitle == "Demandes d'abonnement (2+)")
        #expect(viewModel.sections.flatMap(\.groups).map(\.id) == ["follow_accepted:2"])
        #expect(!viewModel.isEmpty)

        social.followRequestResults = [.success(UserPage(items: [requester(3)], nextCursor: nil))]
        await viewModel.loadMoreRequests()
        #expect(social.followRequestCursors == [nil, "c1"])
        #expect(viewModel.followRequestsTitle == "Demandes d'abonnement (3)")
    }

    @Test func `seules des demandes : l'écran n'est pas vide`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 0))]
        social.followRequestResults = [.success(UserPage(items: [requester(1)], nextCursor: nil))]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(!viewModel.isEmpty)
    }

    @Test func `accepter : la demande disparaît tout de suite, puis l'API confirme`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 0))]
        social.followRequestResults = [.success(UserPage(items: [requester(1), requester(2)], nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()
        var duringCall: [String]?
        social.duringFollowRequest = { duringCall = viewModel.followRequests.map(\.id) }

        await viewModel.respond(.accept, to: requester(1))

        #expect(duringCall == ["r2"])
        #expect(social.acceptedRequests == ["r1"])
        #expect(viewModel.followRequests.map(\.id) == ["r2"])
        #expect(viewModel.requestErrorMessage == nil)
    }

    @Test func `refus en échec : la demande revient avec un message`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 0))]
        social.followRequestResults = [.success(UserPage(items: [requester(1)], nextCursor: nil))]
        social.followRequestErrors = [.unreachable]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.respond(.decline, to: requester(1))

        #expect(social.declinedRequests == ["r1"])
        #expect(viewModel.followRequests.map(\.id) == ["r1"])
        #expect(viewModel.requestErrorMessage == "Impossible de refuser cette demande. Vérifiez votre connexion et réessayez.")
    }

    @Test func `demande annulée entre-temps (404) : elle ne revient pas, sans message`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 0))]
        social.followRequestResults = [.success(UserPage(items: [requester(1)], nextCursor: nil))]
        social.followRequestErrors = [.followRequestNotFound]
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.respond(.accept, to: requester(1))

        #expect(viewModel.followRequests.isEmpty)
        #expect(viewModel.requestErrorMessage == nil)
    }

    @Test func `deux appuis rapides : un seul appel`() async {
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 0))]
        social.followRequestResults = [.success(UserPage(items: [requester(1)], nextCursor: nil))]
        let viewModel = makeViewModel()
        await viewModel.load()
        social.duringFollowRequest = { await viewModel.respond(.decline, to: requester(1)) }

        await viewModel.respond(.accept, to: requester(1))

        #expect(social.acceptedRequests == ["r1"])
        #expect(social.declinedRequests.isEmpty)
    }

    @Test func `demandes indisponibles : l'Activité s'affiche, la section propose de réessayer`() async {
        service.fetchResults = [.success(ActivityPage(items: [.fixture(id: "a")], nextCursor: nil, unreadCount: 1))]
        social.followRequestResults = [.failure(.unreachable)]
        let viewModel = makeViewModel()

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.requestsLoadFailed)
        #expect(viewModel.showsFollowRequests)

        social.followRequestResults = [.success(UserPage(items: [requester(1)], nextCursor: nil))]
        await viewModel.loadRequests()
        #expect(!viewModel.requestsLoadFailed)
        #expect(viewModel.followRequests.map(\.id) == ["r1"])
    }

    @Test func `phrases des demandes et des acceptations`() {
        #expect(ActivityViewModel.message(for: .fixture(id: "a", kind: .followAccepted)) == "lea a accepté votre demande d'abonnement.")
        #expect(ActivityViewModel.message(for: .fixture(id: "b", kind: .followRequest)) == "lea a demandé à vous suivre.")
        #expect(ActivityViewModel.destination(for: .fixture(id: "a", kind: .followAccepted)) == .profile(ProfileRoute(username: "lea")))
    }
}
