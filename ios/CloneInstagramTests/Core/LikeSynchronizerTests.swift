import Testing
@testable import CloneInstagram

struct LikeSynchronizerTests {
    private let service = FakeEngagementService()
    private let likes: LikeSynchronizer
    /// Post non aimé, 4 likes.
    private let post: Post

    init() {
        likes = LikeSynchronizer(service: service)
        var post = Post.fixture()
        post.likeCount = 4
        self.post = post
    }

    private var shown: LikeStatus {
        likes.displayed(post).likeStatus
    }

    @Test func `like : optimiste pendant l'appel, puis état de l'API`() async {
        service.results = [.success(LikeStatus(isLiked: true, likeCount: 7))]
        var duringCall: LikeStatus?
        service.duringCall = { duringCall = shown }

        let outcome = await likes.toggleLike(post)

        #expect(duringCall == LikeStatus(isLiked: true, likeCount: 5))
        #expect(outcome == .confirmed)
        #expect(shown == LikeStatus(isLiked: true, likeCount: 7))
        #expect(service.calls == [.init(isLiking: true, postId: post.id)])
    }

    @Test func `post déjà aimé : unlike envoyé par DELETE`() async {
        var liked = post
        liked.isLiked = true

        _ = await likes.toggleLike(liked)

        #expect(service.calls == [.init(isLiking: false, postId: post.id)])
    }

    @Test func `échec : retour à l'état confirmé avec un message`() async {
        service.results = [.failure(.unreachable)]

        let outcome = await likes.toggleLike(post)

        #expect(outcome == .reverted(message: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."))
        #expect(shown == LikeStatus(isLiked: false, likeCount: 4))
    }

    @Test func `post supprimé ou invisible (404) → postGone`() async {
        service.results = [.failure(.postNotFound)]

        #expect(await likes.toggleLike(post) == .postGone)
    }

    @Test func `double tap : like seulement, rien si déjà aimé`() async {
        _ = await likes.likeFromDoubleTap(post)

        #expect(await likes.likeFromDoubleTap(post) == nil)
        #expect(service.calls.count == 1)
    }

    @Test func `deux taps pendant l'appel : aucun appel de plus`() async {
        var nestedOutcomes: [LikeOutcome?] = []
        service.duringCall = {
            await nestedOutcomes.append(likes.toggleLike(post))
            await nestedOutcomes.append(likes.toggleLike(post))
        }

        let outcome = await likes.toggleLike(post)

        #expect(nestedOutcomes == [nil, nil])
        #expect(service.calls.count == 1)
        #expect(outcome == .confirmed)
        #expect(shown.isLiked)
    }

    @Test func `un tap pendant l'appel : un seul appel de rattrapage`() async {
        service.duringCall = { _ = await likes.toggleLike(post) }

        _ = await likes.toggleLike(post)

        #expect(service.calls.map(\.isLiking) == [true, false])
        #expect(shown == LikeStatus(isLiked: false, likeCount: 0))
    }

    @Test func `posts reçus de l'API : leur état devient le dernier connu`() async {
        _ = await likes.toggleLike(post)
        var reloaded = post
        reloaded.likeCount = 12

        likes.record([reloaded])

        #expect(shown == LikeStatus(isLiked: false, likeCount: 12))
    }

    @Test func `posts reçus pendant un like en cours : l'état voulu est gardé`() async {
        service.duringCall = { likes.record([post]) }

        _ = await likes.toggleLike(post)

        #expect(shown.isLiked)
    }

    @Test func `déconnexion : plus aucun état gardé`() async {
        _ = await likes.toggleLike(post)

        likes.reset()

        #expect(shown == post.likeStatus)
    }

    @Test(arguments: [
        (
            EngagementServiceError.rateLimited(retryAfter: 30),
            true,
            "Vous avez effectué beaucoup d'actions en peu de temps. Réessayez dans un instant."
        ),
        (.unauthenticated, true, "Votre session a expiré. Reconnectez-vous."),
        (.unexpectedResponse(statusCode: 500), true, "Impossible d'aimer cette publication. Réessayez."),
        (.unexpectedResponse(statusCode: 500), false, "Impossible de retirer votre mention J'aime. Réessayez."),
    ])
    func `messages d'erreur`(error: EngagementServiceError, liking: Bool, expected: String) {
        #expect(LikeSynchronizer.message(for: error, liking: liking) == expected)
    }
}
