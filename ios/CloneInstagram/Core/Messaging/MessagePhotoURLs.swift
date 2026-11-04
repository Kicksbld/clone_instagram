import Foundation
import Nuke

/**
 Signed URLs of message photos (ADR-023): each URL is reused until shortly before it expires, then a new one is
 requested. Nuke caches the photo by media and variant (`imageID`), never by URL: a new signed URL does not
 download a photo already in cache.
 */
final class MessagePhotoURLs {
    /// Disk cache keyed by `imageID` (no HTTP cache keyed by URL), dedicated to message photos.
    static let pipeline = ImagePipeline(configuration: .withDataCache(name: "message-photos"))

    /// A URL about to expire is renewed instead of being handed to a load that would fail.
    private static let renewalMargin: TimeInterval = 60

    private let service: any MessagingService
    private let now: () -> Date
    private var signed: [String: SignedPhotoURL] = [:]
    private var inFlight: [String: Task<SignedPhotoURL?, Never>] = [:]
    private var revision = 0

    init(service: any MessagingService, now: @escaping () -> Date = Date.init) {
        self.service = service
        self.now = now
    }

    static func imageID(mediaId: String, variant: PhotoVariant) -> String {
        "message-photo/\(mediaId)/\(variant.rawValue)"
    }

    /// Request for this photo, or `nil` if it is unavailable (conversation invisible, network…).
    func request(mediaId: String, variant: PhotoVariant) async -> ImageRequest? {
        let key = Self.imageID(mediaId: mediaId, variant: variant)
        guard let url = await signedURL(key: key, mediaId: mediaId, variant: variant) else { return nil }
        var request = ImageRequest(url: url.url)
        request.imageID = key
        return request
    }

    /// The load failed (URL expired or refused): the next request asks a new URL.
    func expire(mediaId: String, variant: PhotoVariant) {
        signed[Self.imageID(mediaId: mediaId, variant: variant)] = nil
    }

    /// Sign-out: URLs of the previous account are forgotten.
    func reset() {
        revision += 1
        signed = [:]
        inFlight.values.forEach { $0.cancel() }
        inFlight = [:]
    }

    private func signedURL(key: String, mediaId: String, variant: PhotoVariant) async -> SignedPhotoURL? {
        if let current = signed[key], current.expiresAt.timeIntervalSince(now()) > Self.renewalMargin {
            return current
        }
        if let pending = inFlight[key] {
            return await pending.value
        }
        let started = revision
        let task = Task { [service] in try? await service.photoURL(mediaId: mediaId, variant: variant) }
        inFlight[key] = task
        let result = await task.value
        guard started == revision else { return nil }
        inFlight[key] = nil
        signed[key] = result
        return result
    }
}
