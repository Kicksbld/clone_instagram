import Foundation
import Testing
@testable import CloneInstagram

struct APIIdentityServiceTests {
    private static let meJSON = """
    {"id":"0199a1b2-0000-7000-8000-000000000001","username":"killian","fullName":"Killian","bio":"Dev",\
    "birthDate":"2000-01-31","isPrivate":false,"status":"active","followerCount":1,"followingCount":2,\
    "postCount":3,"createdAt":"2026-09-25T12:00:00.000Z"}
    """

    private func makeService(_ reply: StubTransport.Reply) throws -> APIIdentityService {
        let configuration = try APIConfiguration(rawBaseURL: "http://localhost:3000")
        return APIIdentityService(
            client: APIClientFactory.makeClient(configuration: configuration, transport: StubTransport(reply: reply))
        )
    }

    private func problem(_ status: Int, _ code: String) -> StubTransport.Reply {
        let body = #"{"type":"about:blank","title":"x","status":\#(status),"detail":"x","code":"\#(code)"}"#
        return .response(status: status, contentType: "application/problem+json", body: body)
    }

    @Test func `GET /me converti en modèle de l'app`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: Self.meJSON))

        let profile = try await service.fetchMe()

        #expect(profile == Profile(
            id: "0199a1b2-0000-7000-8000-000000000001",
            username: "killian",
            fullName: "Killian",
            bio: "Dev",
            isPrivate: false,
            status: .active,
            followerCount: 1,
            followingCount: 2,
            postCount: 3
        ))
    }

    @Test(arguments: [
        (404, "profile_not_found", IdentityServiceError.profileNotFound),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs de GET /me selon le code`(status: Int, code: String, expected: IdentityServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.fetchMe() }
    }

    @Test(arguments: [
        (409, "username_taken", IdentityServiceError.usernameTaken),
        (409, "profile_already_exists", .profileAlreadyExists),
        (422, "age_requirement_not_met", .ageRequirementNotMet),
        (400, "validation_failed", .invalidInput),
    ])
    func `erreurs de l'onboarding selon le code`(status: Int, code: String, expected: IdentityServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) {
            try await service.completeOnboarding(
                username: "killian",
                fullName: "Killian",
                birthDate: BirthDate(year: 2000, month: 1, day: 31)
            )
        }
    }

    @Test func `onboarding réussi → profil créé`() async throws {
        let service = try makeService(.response(status: 201, contentType: "application/json", body: Self.meJSON))

        let profile = try await service.completeOnboarding(
            username: "killian",
            fullName: "Killian",
            birthDate: BirthDate(year: 2000, month: 1, day: 31)
        )

        #expect(profile.username == "killian")
    }

    @Test func `disponibilité avec suggestions`() async throws {
        let body = #"{"username":"killian","available":false,"suggestions":["killian_","killian."]}"#
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let availability = try await service.checkUsername("killian")

        #expect(availability == UsernameAvailability(username: "killian", available: false, suggestions: ["killian_", "killian."]))
    }

    @Test func `PATCH /me : username pris`() async throws {
        let service = try makeService(problem(409, "username_taken"))

        await #expect(throws: IdentityServiceError.usernameTaken) {
            try await service.updateMe(ProfileChanges(username: "autre"))
        }
    }

    @Test func `GET /me avec photo → variantes en URL`() async throws {
        let base = "http://192.168.1.20:54321/storage/v1/object/public/media-public/m"
        let body = Self.meJSON.replacingOccurrences(
            of: #""postCount":3,"#,
            with: #""postCount":3,"avatar":{"thumb":"\#(base)/thumb.webp","medium":"\#(base)/medium.webp","large":"\#(base)/large.webp"},"#
        )
        let service = try makeService(.response(status: 200, contentType: "application/json", body: body))

        let profile = try await service.fetchMe()

        #expect(profile.avatar?.thumb.absoluteString == "\(base)/thumb.webp")
        #expect(profile.avatar?.large.absoluteString == "\(base)/large.webp")
    }

    @Test(arguments: [
        (404, "media_not_found"),
        (409, "media_not_ready"),
        (409, "media_already_attached"),
        (422, "media_purpose_mismatch"),
    ])
    func `PATCH /me : photo refusée`(status: Int, code: String) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: IdentityServiceError.mediaRejected) {
            try await service.updateMe(ProfileChanges(avatarMediaId: "0199a1b2-0000-7000-9000-000000000001"))
        }
    }

    @Test func `DELETE /me/avatar → profil sans photo`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: Self.meJSON))

        let profile = try await service.removeAvatar()

        #expect(profile.avatar == nil)
    }

    @Test func `erreur réseau → API injoignable`() async throws {
        let service = try makeService(.failure)

        await #expect(throws: IdentityServiceError.unreachable) { try await service.fetchMe() }
    }

    @Test func `code inconnu → réponse inattendue`() async throws {
        let service = try makeService(problem(404, "autre_chose"))

        await #expect(throws: IdentityServiceError.unexpectedResponse(statusCode: 404)) { try await service.fetchMe() }
    }

    // MARK: - Profil d'un autre utilisateur

    private static let userProfileJSON = """
    {"id":"0199a1b2-5eed-7000-8000-000000000003","username":"chloe.petit","fullName":"Chloé Petit",\
    "bio":"Voyages","isPrivate":true,"followerCount":2,"followingCount":1,"postCount":0,\
    "relationship":{"following":false,"followedBy":true},"canViewContent":false}
    """

    @Test func `GET /users/{username} converti en modèle de l'app`() async throws {
        let service = try makeService(.response(status: 200, contentType: "application/json", body: Self.userProfileJSON))

        let profile = try await service.fetchUserProfile(username: "chloe.petit")

        #expect(profile == UserProfile(
            id: "0199a1b2-5eed-7000-8000-000000000003",
            username: "chloe.petit",
            fullName: "Chloé Petit",
            bio: "Voyages",
            isPrivate: true,
            followerCount: 2,
            followingCount: 1,
            postCount: 0,
            avatar: nil,
            isFollowing: false,
            followsMe: true,
            canViewContent: false
        ))
    }

    @Test(arguments: [
        (404, "user_not_found", IdentityServiceError.userNotFound),
        (400, "validation_failed", .invalidInput),
        (401, "unauthenticated", .unauthenticated),
    ])
    func `erreurs de GET /users/{username} selon le code`(status: Int, code: String, expected: IdentityServiceError) async throws {
        let service = try makeService(problem(status, code))

        await #expect(throws: expected) { try await service.fetchUserProfile(username: "lea.martin") }
    }
}
