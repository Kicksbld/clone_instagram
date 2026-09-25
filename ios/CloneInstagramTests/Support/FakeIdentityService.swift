@testable import CloneInstagram

/// Faux `IdentityService` : réponses programmables, requêtes enregistrées.
final class FakeIdentityService: IdentityService {
    struct OnboardingRequest: Equatable {
        let username: String
        let fullName: String
        let birthDate: BirthDate
    }

    /// Réponses successives de `fetchMe` ; `profileNotFound` quand la liste est vide.
    var meResults: [Result<Profile, IdentityServiceError>] = []
    /// Usernames pris, avec les suggestions renvoyées.
    var takenUsernames: [String: [String]] = [:]
    var checkError: IdentityServiceError?
    /// Réponses successives de `completeOnboarding` ; profil créé quand la liste est vide.
    var onboardingResults: [Result<Profile, IdentityServiceError>] = []
    var updateError: IdentityServiceError?

    private(set) var checkedUsernames: [String] = []
    private(set) var onboardingRequests: [OnboardingRequest] = []
    private(set) var updates: [ProfileChanges] = []

    func fetchMe() async throws(IdentityServiceError) -> Profile {
        guard !meResults.isEmpty else { throw .profileNotFound }
        return try meResults.removeFirst().get()
    }

    func checkUsername(_ username: String) async throws(IdentityServiceError) -> UsernameAvailability {
        checkedUsernames.append(username)
        if let checkError {
            throw checkError
        }
        let suggestions = takenUsernames[username]
        return UsernameAvailability(username: username, available: suggestions == nil, suggestions: suggestions ?? [])
    }

    func completeOnboarding(username: String, fullName: String, birthDate: BirthDate) async throws(IdentityServiceError) -> Profile {
        onboardingRequests.append(OnboardingRequest(username: username, fullName: fullName, birthDate: birthDate))
        guard !onboardingResults.isEmpty else { return .fixture(username: username, fullName: fullName) }
        return try onboardingResults.removeFirst().get()
    }

    func updateMe(_ changes: ProfileChanges) async throws(IdentityServiceError) -> Profile {
        updates.append(changes)
        if let updateError {
            throw updateError
        }
        return .fixture(bio: changes.bio ?? "")
    }
}

extension Profile {
    static func fixture(username: String = "killian", fullName: String = "Killian", bio: String = "") -> Profile {
        Profile(
            id: "0199a1b2-0000-7000-8000-000000000001",
            username: username,
            fullName: fullName,
            bio: bio,
            isPrivate: false,
            status: .active,
            followerCount: 0,
            followingCount: 0,
            postCount: 0
        )
    }
}
