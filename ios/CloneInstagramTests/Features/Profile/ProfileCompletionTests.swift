import Testing
@testable import CloneInstagram

struct ProfileCompletionTests {
    private func profile(avatar: ImageVariants? = nil, bio: String = "", followingCount: Int = 0) -> Profile {
        Profile(
            id: "0199a1b2-0000-7000-8000-000000000001",
            username: "killian",
            fullName: "Killian",
            bio: bio,
            isPrivate: false,
            status: .active,
            followerCount: 0,
            followingCount: followingCount,
            postCount: 0,
            avatar: avatar
        )
    }

    @Test func `nouveau profil : aucune étape faite`() {
        let completion = ProfileCompletion(profile: profile())

        #expect(completion.completedCount == 0)
        #expect(completion.totalCount == 3)
        #expect(!completion.isComplete)
    }

    @Test func `photo et bio faites, aucun abonnement`() {
        let completion = ProfileCompletion(profile: profile(avatar: .fixture, bio: "Dev"))

        #expect(completion.completedCount == 2)
        #expect(completion.isCompleted(.photo))
        #expect(completion.isCompleted(.bio))
        #expect(!completion.isCompleted(.followAccounts))
    }

    @Test func `toutes les étapes faites : carte masquée`() {
        let completion = ProfileCompletion(profile: profile(avatar: .fixture, bio: "Dev", followingCount: 1))

        #expect(completion.isComplete)
    }
}
