import APIClient
import Foundation

/// One foreground session. Services consume events; views never read the socket (ADR-021).
final class RealtimeClient {
    private let makeTransport: () -> any RealtimeTransport
    private let accessToken: () async -> String?
    private let mediaEvents: MediaProcessingEvents?
    private let messaging: MessagingStore?
    private let badge: ActivityBadge
    private let onSuspended: () -> Void
    private let sleep: (Duration) async throws -> Void
    private var session: String?
    private var worker: Task<Void, Never>?
    private var transport: (any RealtimeTransport)?
    private var renewal: Task<Void, Never>?
    private var catchUp: Task<Void, Never>?

    init(
        makeTransport: @escaping () -> any RealtimeTransport,
        accessToken: @escaping () async -> String?,
        badge: ActivityBadge,
        onSuspended: @escaping () -> Void,
        messaging: MessagingStore? = nil,
        mediaEvents: MediaProcessingEvents? = nil,
        sleep: @escaping (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.messaging = messaging
        self.makeTransport = makeTransport
        self.accessToken = accessToken
        self.mediaEvents = mediaEvents
        self.badge = badge
        self.onSuspended = onSuspended
        self.sleep = sleep
    }

    /// nil means background, signed out, or a suspended account. Changing accounts cancels old work.
    func setSession(_ id: String?) {
        guard id != session else { return }
        session = id
        worker?.cancel()
        renewal?.cancel()
        catchUp?.cancel()
        transport?.close()
        transport = nil
        guard id != nil else { return }
        mediaEvents?.refresh()
        worker = Task { await connect() }
    }

    private func connect() async {
        var attempt = 0
        while !Task.isCancelled {
            let socket = makeTransport()
            transport = socket
            do {
                try await authenticate(socket)
                while !Task.isCancelled {
                    let text = try await socket.receive()
                    try Task.checkCancellation()
                    guard let data = text.data(using: .utf8),
                          let event = try? JSONDecoder().decode(Components.Schemas.RealtimeEvent.self, from: data)
                    else { continue }
                    handle(event, attempt: &attempt)
                }
            } catch {
                guard !Task.isCancelled else { socket.close(); return }
                renewal?.cancel()
                catchUp?.cancel()
                if socket.closeCode == 4403 {
                    socket.close()
                    onSuspended()
                    return
                }
            }
            socket.close()
            do {
                try await sleep(.seconds(min(30, 1 << min(attempt, 5))))
            } catch { return }
            attempt += 1
        }
    }

    private func handle(_ event: Components.Schemas.RealtimeEvent, attempt: inout Int) {
        switch event {
        case .auth_ok:
            mediaEvents?.refresh()
            attempt = 0
            catchUp?.cancel()
            catchUp = Task {
                await badge.refresh()
                await messaging?.reconnect()
            }
        case let .message_created(event):
            if let message = ChatMessage(event.data) {
                messaging?.receiveLive(message)
                Task { await messaging?.refresh() }
            }
        case let .conversation_read(event):
            messaging?.readPositionChanged(
                conversationId: event.data.conversationId,
                userId: event.data.userId,
                lastReadMessageId: event.data.lastReadMessageId
            )
        case let .media_ready(event):
            receiveReady(event)
        case let .media_failed(event):
            let reason: MediaFailureReason = switch event.data.reason {
            case .invalidVideo: .invalidVideo
            case .videoTooLong: .videoTooLong
            case .invalidImage: .invalidImage
            case .fileTooLarge: .fileTooLarge
            case .processingError: .processingError
            }
            mediaEvents?.receive(mediaId: event.data.mediaId, status: .failed(reason))
        case let .activity_created(activity):
            if activity.data.unreadCount >= 0 {
                badge.received(unreadCount: activity.data.unreadCount)
            }
        }
    }

    private func receiveReady(_ event: Components.Schemas.MediaReady) {
        if case .VideoVariants = event.data.variants {
            mediaEvents?.receive(mediaId: event.data.mediaId, status: .videoReady)
            return
        }
        guard case let .ImageVariants(value) = event.data.variants, let variants = ImageVariants(value) else { return }
        mediaEvents?.receive(mediaId: event.data.mediaId, status: .ready(variants))
    }

    private func authenticate(_ socket: any RealtimeTransport) async throws {
        guard let token = await accessToken() else { throw URLError(.userAuthenticationRequired) }
        try Task.checkCancellation()
        let data = try JSONEncoder().encode(Components.Schemas.RealtimeAuth(_type: .auth, token: token))
        guard let message = String(data: data, encoding: .utf8) else { throw EncodingError.invalidValue(
            data,
            .init(codingPath: [], debugDescription: "Auth message is not UTF-8")
        ) }
        try await socket.send(message)
        try Task.checkCancellation()
        renewal?.cancel()
        // The token is trusted only by the server; decoding here merely schedules refresh early.
        let delay = Self.renewalDelay(token)
        renewal = Task {
            do {
                try await sleep(.seconds(delay))
                try Task.checkCancellation()
                try await authenticate(socket)
            } catch {
                if !Task.isCancelled {
                    socket.close()
                }
            }
        }
    }

    private static func renewalDelay(_ token: String) -> Double {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return 30 }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64),
              let payload = try? JSONDecoder().decode(Expiry.self, from: data)
        else { return 30 }
        return max(1, payload.exp - Date().timeIntervalSince1970 - 30)
    }

    private struct Expiry: Decodable { let exp: Double }
}
