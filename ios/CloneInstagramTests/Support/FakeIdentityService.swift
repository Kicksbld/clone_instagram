import Foundation
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
    var removeAvatarError: IdentityServiceError?
    /// Appelé pendant `removeAvatar`, avant la réponse.
    var duringRemoveAvatar: (() -> Void)?
    /// Erreur de `updateSettings` ; sinon le profil renvoyé reflète le paramètre demandé.
    var settingsError: IdentityServiceError?
    /// Appelé pendant `updateSettings`, avant la réponse (ex. l'utilisateur change encore d'avis).
    var duringSettingsUpdate: (() async -> Void)?
    /// Réponses successives de `fetchUserProfile` ; `userNotFound` quand la liste est vide.
    var userProfileResults: [Result<UserProfile, IdentityServiceError>] = []
    var deleteMeError: IdentityServiceError?

    private(set) var checkedUsernames: [String] = []
    private(set) var onboardingRequests: [OnboardingRequest] = []
    private(set) var updates: [ProfileChanges] = []
    private(set) var removeAvatarCount = 0
    private(set) var settingsUpdates: [Bool] = []
    private(set) var fetchedUsernames: [String] = []
    private(set) var deleteMeCount = 0

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
        var profile = Profile.fixture(
            username: changes.username ?? "killian",
            fullName: changes.fullName ?? "Killian",
            bio: changes.bio ?? ""
        )
        if changes.avatarMediaId != nil {
            profile.avatar = .fixture
        }
        return profile
    }

    func removeAvatar() async throws(IdentityServiceError) -> Profile {
        removeAvatarCount += 1
        duringRemoveAvatar?()
        if let removeAvatarError {
            throw removeAvatarError
        }
        return .fixture()
    }

    func updateSettings(isPrivate: Bool) async throws(IdentityServiceError) -> Profile {
        settingsUpdates.append(isPrivate)
        if let duringSettingsUpdate {
            self.duringSettingsUpdate = nil
            await duringSettingsUpdate()
        }
        if let settingsError {
            throw settingsError
        }
        return .fixture(isPrivate: isPrivate)
    }

    func fetchUserProfile(username: String) async throws(IdentityServiceError) -> UserProfile {
        fetchedUsernames.append(username)
        guard !userProfileResults.isEmpty else { throw .userNotFound }
        return try userProfileResults.removeFirst().get()
    }

    func deleteMe() async throws(IdentityServiceError) {
        deleteMeCount += 1
        if let deleteMeError {
            throw deleteMeError
        }
    }
}

extension ImageVariants {
    static let fixture = ImageVariants(
        thumb: URL(filePath: "/media-public/photo/thumb.webp"),
        medium: URL(filePath: "/media-public/photo/medium.webp"),
        large: URL(filePath: "/media-public/photo/large.webp")
    )
}

extension Profile {
    static func fixture(
        username: String = "killian",
        fullName: String = "Killian",
        bio: String = "",
        isPrivate: Bool = false,
        status: AccountStatus = .active
    ) -> Profile {
        Profile(
            id: "0199a1b2-0000-7000-8000-000000000001",
            username: username,
            fullName: fullName,
            bio: bio,
            isPrivate: isPrivate,
            status: status,
            followerCount: 0,
            followingCount: 0,
            postCount: 0
        )
    }
}

extension UserProfile {
    static func fixture(
        username: String = "lea.martin",
        isPrivate: Bool = false,
        isFollowing: Bool = false,
        followsMe: Bool = false,
        canViewContent: Bool = true
    ) -> UserProfile {
        UserProfile(
            id: "0199a1b2-5eed-7000-8000-000000000001",
            username: username,
            fullName: "Léa Martin",
            bio: "Photographe",
            isPrivate: isPrivate,
            followerCount: 4,
            followingCount: 2,
            postCount: 0,
            avatar: nil,
            isFollowing: isFollowing,
            followsMe: followsMe,
            canViewContent: canViewContent
        )
    }
}
