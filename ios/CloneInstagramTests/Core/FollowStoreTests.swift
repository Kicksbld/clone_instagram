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
        await follows.setFollowing(
            following,
            userId: profile.id,
            current: FollowState(shown),
            isPrivate: profile.isPrivate,
            source: source
        )
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

        _ = await follows.setFollowing(true, userId: user.id, current: FollowState(user), isPrivate: false, source: .list)

        #expect(follows.displayed(profile) == profile)
    }

    @Test func `ne plus suivre un compte privé : contenus masqués tout de suite, rétablis si l'API échoue`() async {
        let followed = UserProfile.fixture(isPrivate: true, isFollowing: true)
        follows.record(followed)
        social.followResults = [.failure(.unreachable)]
        var visibleDuringCall: Bool?
        social.duringFollow = { visibleDuringCall = follows.displayed(followed).canViewContent }

        _ = await follows.setFollowing(
            false,
            userId: followed.id,
            current: FollowState(followed),
            isPrivate: true,
            source: .profile
        )

        #expect(visibleDuringCall == false)
        #expect(follows.displayed(followed).canViewContent)
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

    // MARK: - Demandes d'abonnement (T20)

    @Test func `compte privé : « Demandé » tout de suite, sans abonné de plus ni accès aux contenus`() async {
        let privateProfile = UserProfile.fixture(isPrivate: true, canViewContent: false)
        follows.record(privateProfile)
        social.followResults = [.success(FollowStatus(isFollowing: false, followerCount: 4, isRequested: true))]
        var duringCall: UserProfile?
        social.duringFollow = { duringCall = follows.displayed(privateProfile) }

        let outcome = await follows.setFollowing(
            true,
            userId: privateProfile.id,
            current: FollowState(privateProfile),
            isPrivate: true,
            source: .profile
        )

        #expect(duringCall?.isRequested == true)
        #expect(duringCall?.isFollowing == false)
        #expect(duringCall?.followerCount == 4)
        #expect(outcome == .confirmed)
        let shown = follows.displayed(privateProfile)
        #expect(shown.isRequested && !shown.isFollowing && !shown.canViewContent)
        #expect(follows.followingCountDelta == 0)
        // Une demande n'est pas un abonnement (ADR-013) : aucun événement.
        #expect(analytics.events.isEmpty)
    }

    @Test func `annuler une demande : « Suivre » tout de suite, rétabli « Demandé » si l'API échoue`() async {
        let requested = UserProfile.fixture(isPrivate: true, canViewContent: false, isRequested: true)
        follows.record(requested)
        social.followResults = [.failure(.unreachable)]
        var duringCall: Bool?
        social.duringFollow = { duringCall = follows.displayed(requested).isRequested }

        let outcome = await follows.setFollowing(
            false,
            userId: requested.id,
            current: FollowState(requested),
            isPrivate: true,
            source: .profile
        )

        #expect(duringCall == false)
        #expect(social.unfollows == [requested.id])
        #expect(outcome == .reverted(message: "Impossible de ne plus suivre ce compte. Vérifiez votre connexion et réessayez."))
        #expect(follows.displayed(requested).isRequested)
    }

    @Test func `compte devenu public entre-temps : l'état de l'API (abonné) remplace « Demandé »`() async {
        let privateProfile = UserProfile.fixture(isPrivate: true, canViewContent: false)
        social.followResults = [.success(FollowStatus(isFollowing: true, followerCount: 5))]

        _ = await follows.setFollowing(
            true,
            userId: privateProfile.id,
            current: FollowState(privateProfile),
            isPrivate: true,
            source: .profile
        )

        let shown = follows.displayed(privateProfile)
        #expect(shown.isFollowing && !shown.isRequested)
        #expect(shown.followerCount == 5)
    }

    @Test func `liste reçue de l'API : l'état « Demandé » est repris`() {
        follows.record([.fixture(id: profile.id, isPrivate: true, isRequested: true)])

        #expect(follows.displayed(profile).isRequested)
    }
}
