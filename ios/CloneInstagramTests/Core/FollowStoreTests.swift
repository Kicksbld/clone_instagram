import Testing
@testable import CloneInstagram

struct FollowStoreTests {
    private let social = FakeSocialService()
    private let analytics = FakeAnalyticsService()
    private let follows: FollowStore
    /// Profil non suivi, 4 abonnés.
    private let profile = UserProfile.fixture()

    init() {
        follows = FollowStore(service: social, analytics: analytics)
    }

    private var shown: UserProfile {
        follows.displayed(profile)
    }

    private func follow(_ following: Bool = true, source: FollowSource = .profile) async -> FollowOutcome? {
        await follows.setFollowing(following, userId: profile.id, current: FollowState(shown), source: source)
    }

    @Test func `suivre : optimiste pendant l'appel, puis état de l'API`() async {
        social.followResults = [.success(FollowStatus(isFollowing: true, followerCount: 9))]
        var duringCall: FollowState?
        social.duringFollow = { duringCall = FollowState(shown) }

        let outcome = await follow()

        #expect(duringCall == FollowState(isFollowing: true, followerCount: 5))
        #expect(outcome == .confirmed)
        #expect(FollowState(shown) == FollowState(isFollowing: true, followerCount: 9))
        #expect(analytics.events == [.userFollowed(.profile)])
    }

    @Test func `échec : retour à l'état confirmé avec un message`() async {
        social.followResults = [.failure(.unreachable)]

        let outcome = await follow()

        #expect(outcome == .reverted(message: "Impossible de suivre ce compte. Vérifiez votre connexion et réessayez."))
        #expect(shown == profile)
        #expect(analytics.events.isEmpty)
    }

    @Test func `compte privé → message dédié`() async {
        social.followResults = [.failure(.accountPrivate)]

        #expect(await follow() == .reverted(message: "Ce compte est privé : il ne peut pas encore être suivi."))
    }

    @Test func `compte devenu invisible (404) → userGone`() async {
        social.followResults = [.failure(.userNotFound)]

        #expect(await follow() == .userGone)
    }

    @Test func `deux taps pendant l'appel : aucun appel de plus`() async {
        var nested: [FollowOutcome?] = []
        social.duringFollow = {
            await nested.append(follow(false))
            await nested.append(follow(true))
        }

        let outcome = await follow()

        #expect(nested == [nil, nil])
        #expect(social.follows.count == 1)
        #expect(social.unfollows.isEmpty)
        #expect(outcome == .confirmed)
    }

    @Test func `suivi depuis une liste : le profil affiché suit, compteur compris`() async {
        let user = UserSummary.fixture(id: profile.id)
        social.followResults = [.failure(.unreachable)]
        social.duringFollow = {
            #expect(follows.displayed(profile).isFollowing)
            #expect(follows.displayed(profile).followerCount == 5)
        }

        _ = await follows.setFollowing(true, userId: user.id, current: FollowState(user), source: .list)

        #expect(follows.displayed(profile) == profile)
    }

    @Test func `profil reçu pendant un follow en cours : l'état voulu est gardé`() async {
        social.duringFollow = { follows.record(profile) }

        _ = await follow()

        #expect(shown.isFollowing)
    }

    @Test func `liste reçue avec un autre état : nombre d'abonnés oublié`() {
        follows.record(profile)

        follows.record([.fixture(id: profile.id, isFollowing: true)])

        #expect(shown.isFollowing)
        #expect(shown.followerCount == 5)
    }

    @Test func `mon compteur suivi(e)s suit mes follows jusqu'au rechargement de mon profil`() async {
        let me = Profile.fixture()

        _ = await follow()
        #expect(follows.displayed(me: me).followingCount == 1)

        follows.myProfileReloaded()
        #expect(follows.displayed(me: me).followingCount == 0)
    }

    @Test func `mon compteur suivi(e)s : optimiste pendant l'appel, rétabli en cas d'échec`() async {
        let me = Profile.fixture()
        social.followResults = [.failure(.unreachable)]
        var duringCall: Int?
        social.duringFollow = { duringCall = follows.displayed(me: me).followingCount }

        _ = await follow()

        #expect(duringCall == 1)
        #expect(follows.displayed(me: me).followingCount == 0)
    }

    @Test func `déconnexion : plus aucun état gardé`() async {
        _ = await follow()

        follows.reset()

        #expect(shown == profile)
        #expect(follows.followingCountDelta == 0)
    }
}
