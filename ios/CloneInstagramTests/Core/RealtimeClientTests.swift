import Foundation
import Testing
@testable import CloneInstagram

struct RealtimeClientTests {
    @Test func `authentication catches up by REST and activity events update the badge`() async {
        let transport = FakeRealtimeTransport()
        let service = FakeActivityService()
        service.fetchResults = [.success(ActivityPage(items: [], nextCursor: nil, unreadCount: 2))]
        let badge = ActivityBadge(service: service)
        let client = RealtimeClient(
            makeTransport: { transport }, accessToken: { "token" }, badge: badge,
            onSuspended: {}
        )
        client.setSession("alice")
        await eventually { !transport.sent.isEmpty }
        #expect(transport.sent.first?.contains("auth") == true)
        transport.deliver(#"{"type":"auth.ok"}"#)
        await eventually { badge.unreadCount == 2 }
        transport.deliver(#"{"type":"future.event","data":{}}"#)
        transport.deliver(#"{"type":"activity.created","data":{"unreadCount":5}}"#)
        await eventually { badge.unreadCount == 5 }
        client.setSession(nil)
        #expect(transport.closed)
    }

    @Test func `conversation read events move « Vu » in the messaging store`() async {
        let transport = FakeRealtimeTransport()
        let messaging = MessagingStore(service: FakeMessagingService())
        messaging.setAccount("me")
        let conversation = "0199a1b2-0000-7000-8000-00000000c001"
        let mine = "0199a1b2-0000-7000-8000-00000000a001"
        messaging.receive(ChatMessage(
            id: mine, conversationId: conversation, senderId: "me", clientId: mine, body: "Salut", createdAt: .now
        ))
        let client = RealtimeClient(
            makeTransport: { transport }, accessToken: { "token" }, badge: ActivityBadge(service: FakeActivityService()),
            onSuspended: {}, messaging: messaging
        )
        client.setSession("me")
        await eventually { !transport.sent.isEmpty }
        let reader = "0199a1b2-0000-7000-8000-00000000b001"
        transport.deliver(
            #"{"type":"conversation.read","data":{"conversationId":"\#(conversation)","#
                + #""userId":"\#(reader)","lastReadMessageId":"\#(mine)"}}"#
        )
        await eventually { messaging.seenMessageId(in: conversation) == mine }
        client.setSession(nil)
    }

    @Test func `media ready without public variants ends the wait of a message photo`() async {
        let transport = FakeRealtimeTransport()
        let events = MediaProcessingEvents()
        let mediaId = "0199a1b2-0000-7000-9000-000000000001"
        let subscription = events.signals(mediaId: mediaId, initialDelay: .seconds(60))
        let client = RealtimeClient(
            makeTransport: { transport }, accessToken: { "token" }, badge: ActivityBadge(service: FakeActivityService()),
            onSuspended: {}, mediaEvents: events
        )
        client.setSession("me")
        await eventually { !transport.sent.isEmpty }

        transport.deliver(#"{"type":"media.ready","data":{"mediaId":"\#(mediaId)"}}"#)

        var received: MediaStatus?
        // `.refresh` (REST catch-up after connecting) is skipped: only the event's status counts.
        for await signal in subscription.stream {
            if case let .status(status) = signal {
                received = status
                break
            }
        }
        guard case .privateReady = received else {
            Issue.record("Statut attendu : privateReady")
            return
        }
        events.stop(subscription.id)
        client.setSession(nil)
    }

    @Test func `suspension reports to the app and never reconnects`() async {
        let transport = FakeRealtimeTransport()
        var connections = 0
        var suspended = false
        var delays: [Duration] = []
        let client = RealtimeClient(
            makeTransport: { connections += 1; return transport },
            accessToken: { "token" }, badge: ActivityBadge(service: FakeActivityService()),
            onSuspended: { suspended = true },
            sleep: { duration in
                delays.append(duration)
                try await Task.sleep(for: .seconds(1000))
            }
        )
        client.setSession("alice")
        await eventually { !transport.sent.isEmpty }
        transport.fail(code: 4403)
        await eventually { suspended }
        #expect(connections == 1)
        #expect(!delays.contains(.seconds(1)))
        client.setSession(nil)
    }

    @Test func `connection failures back off to thirty seconds`() async {
        var delays: [Duration] = []
        let client = RealtimeClient(
            makeTransport: { let socket = FakeRealtimeTransport(); socket.sendFails = true; return socket },
            accessToken: { "token" }, badge: ActivityBadge(service: FakeActivityService()),
            onSuspended: {}, sleep: { duration in
                delays.append(duration)
                if delays.count == 7 {
                    throw CancellationError()
                }
            }
        )
        client.setSession("alice")
        await eventually { delays.count == 7 }
        #expect(delays == [1, 2, 4, 8, 16, 30, 30].map { .seconds($0) })
        client.setSession(nil)
    }

    @Test func `background closes the connection and foreground authenticates again`() async {
        let first = FakeRealtimeTransport()
        let second = FakeRealtimeTransport()
        var connections = 0
        let client = RealtimeClient(
            makeTransport: { connections += 1; return connections == 1 ? first : second },
            accessToken: { "token" }, badge: ActivityBadge(service: FakeActivityService()), onSuspended: {}
        )
        client.setSession("alice")
        await eventually { !first.sent.isEmpty }
        client.setSession(nil)
        #expect(first.closed)
        client.setSession("alice")
        await eventually { !second.sent.isEmpty }
        #expect(connections == 2)
        client.setSession(nil)
    }

    @Test func `renewal sends a new token on the same socket`() async {
        let transport = FakeRealtimeTransport()
        var tokenReads = 0
        var waits = 0
        var connections = 0
        let client = RealtimeClient(
            makeTransport: { connections += 1; return transport },
            accessToken: { tokenReads += 1; return "token-\(tokenReads)" },
            badge: ActivityBadge(service: FakeActivityService()), onSuspended: {},
            sleep: { _ in
                waits += 1
                if waits > 1 {
                    try await Task.sleep(for: .seconds(1000))
                }
            }
        )
        client.setSession("alice")
        await eventually { transport.sent.count >= 2 }
        #expect(transport.sent[0].contains("token-1"))
        #expect(transport.sent[1].contains("token-2"))
        #expect(connections == 1)
        client.setSession(nil)
    }

    @Test func `slow REST catch-up does not block activity events or suspension`() async {
        let transport = FakeRealtimeTransport()
        let service = PendingCatchUpService()
        let badge = ActivityBadge(service: service)
        var suspended = false
        let client = RealtimeClient(
            makeTransport: { transport }, accessToken: { "token" }, badge: badge,
            onSuspended: { suspended = true }
        )
        client.setSession("alice")
        await eventually { !transport.sent.isEmpty }
        transport.deliver(#"{"type":"auth.ok"}"#)
        await eventually { service.pending != nil }
        transport.deliver(#"{"type":"activity.created","data":{"unreadCount":5}}"#)
        await eventually { badge.unreadCount == 5 }
        transport.fail(code: 4403)
        await eventually { suspended }
        service.pending?.resume(returning: ActivityPage(items: [], nextCursor: nil, unreadCount: 1))
        service.pending = nil
        client.setSession(nil)
        #expect(badge.unreadCount == 5)
    }

    @Test func `authentication completing after backgrounding cannot start renewal`() async {
        let transport = FakeRealtimeTransport()
        transport.holdSend = true
        var delays = 0
        let client = RealtimeClient(
            makeTransport: { transport }, accessToken: { "token" },
            badge: ActivityBadge(service: FakeActivityService()), onSuspended: {},
            sleep: { _ in delays += 1; throw CancellationError() }
        )
        client.setSession("alice")
        await eventually { transport.pendingSend != nil }
        client.setSession(nil)
        transport.pendingSend?.resume()
        transport.pendingSend = nil
        await eventually { !transport.sent.isEmpty }
        for _ in 0 ..< 100 {
            await Task.yield()
        }
        #expect(delays == 0)
        #expect(transport.closed)
    }

    private func eventually(_ condition: () -> Bool) async {
        for _ in 0 ..< 1000 {
            if condition() {
                return
            }
            await Task.yield()
        }
        #expect(condition())
    }
}

final class FakeRealtimeTransport: RealtimeTransport {
    var closeCode = 0
    var sent: [String] = []
    var closed = false
    var sendFails = false
    var holdSend = false
    var pendingSend: CheckedContinuation<Void, Never>?
    private var messages: [String] = []
    private var waiting: CheckedContinuation<String, any Error>?

    func send(_ message: String) async throws {
        if sendFails {
            throw URLError(.notConnectedToInternet)
        }
        if holdSend {
            await withCheckedContinuation { pendingSend = $0 }
        }
        sent.append(message)
    }

    func receive() async throws -> String {
        if !messages.isEmpty {
            return messages.removeFirst()
        }
        if closed {
            throw URLError(.cancelled)
        }
        return try await withCheckedThrowingContinuation { waiting = $0 }
    }

    func close() {
        closed = true
        waiting?.resume(throwing: URLError(.cancelled))
        waiting = nil
    }

    func fail(code: Int) {
        closeCode = code
        close()
    }

    func deliver(_ message: String) {
        if let continuation = waiting {
            waiting = nil
            continuation.resume(returning: message)
        } else {
            messages.append(message)
        }
    }
}

private final class PendingCatchUpService: ActivityService {
    var pending: CheckedContinuation<ActivityPage, Never>?
    func fetchActivity(cursor _: String?) async throws(ActivityServiceError) -> ActivityPage {
        await withCheckedContinuation { pending = $0 }
    }

    func markAllRead() async throws(ActivityServiceError) {}
}
