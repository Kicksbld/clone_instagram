import Foundation
import Testing
@testable import CloneInstagram

@MainActor
struct MessagePhotoURLsTests {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func signed(_ name: String, validFor seconds: TimeInterval) -> SignedPhotoURL {
        SignedPhotoURL(url: URL(filePath: "/sign/\(name)"), expiresAt: start.addingTimeInterval(seconds))
    }

    @Test func reusesTheSignedURLUntilItExpiresThenAsksANewOne() async throws {
        let service = FakeMessagingService()
        var now = start
        let photos = MessagePhotoURLs(service: service, now: { now })
        service.signedURLs = [.success(signed("a", validFor: 3600)), .success(signed("b", validFor: 7200))]

        let first = try #require(await photos.request(mediaId: "m", variant: .large))
        let cached = try #require(await photos.request(mediaId: "m", variant: .large))
        #expect(first.url == URL(filePath: "/sign/a"))
        #expect(cached.url == first.url)
        #expect(service.photoRequests == ["m/large"])

        now = start.addingTimeInterval(3600)
        let renewed = try #require(await photos.request(mediaId: "m", variant: .large))
        #expect(renewed.url == URL(filePath: "/sign/b"))
        #expect(service.photoRequests == ["m/large", "m/large"])
        // Nuke caches by media and variant: a new URL never downloads a cached photo again.
        #expect(renewed.imageID == first.imageID)
        #expect(first.imageID == MessagePhotoURLs.imageID(mediaId: "m", variant: .large))
    }

    @Test func expiredLoadAsksANewURL() async throws {
        let service = FakeMessagingService()
        let photos = MessagePhotoURLs(service: service, now: { start })
        service.signedURLs = [.success(signed("a", validFor: 3600)), .success(signed("b", validFor: 3600))]

        _ = await photos.request(mediaId: "m", variant: .medium)
        photos.expire(mediaId: "m", variant: .medium)
        let renewed = try #require(await photos.request(mediaId: "m", variant: .medium))

        #expect(renewed.url == URL(filePath: "/sign/b"))
    }

    @Test func eachVariantHasItsOwnURLAndCacheKey() async throws {
        let service = FakeMessagingService()
        let photos = MessagePhotoURLs(service: service, now: { start })
        service.signedURLs = [.success(signed("thumb", validFor: 3600)), .success(signed("large", validFor: 3600))]

        let thumb = try #require(await photos.request(mediaId: "m", variant: .thumb))
        let large = try #require(await photos.request(mediaId: "m", variant: .large))

        #expect(thumb.imageID != large.imageID)
        #expect(service.photoRequests == ["m/thumb", "m/large"])
    }

    @Test func unavailablePhotoGivesNoRequest() async {
        let service = FakeMessagingService()
        let photos = MessagePhotoURLs(service: service, now: { start })
        service.signedURLs = [.failure(.notFound)]

        #expect(await photos.request(mediaId: "m", variant: .large) == nil)
    }
}
