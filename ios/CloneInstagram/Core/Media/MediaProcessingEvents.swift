import Foundation

/// Shared by avatar uploads and the persistent post queue. REST recovers lost socket events.
final class MediaProcessingEvents {
    enum Signal: Sendable {
        case status(MediaStatus)
        case refresh
    }

    private var timers: [UUID: Task<Void, Never>] = [:]
    private var listeners: [UUID: (String, AsyncStream<Signal>.Continuation)] = [:]

    func receive(mediaId: String, status: MediaStatus) {
        for (_, listener) in listeners where listener.0 == mediaId {
            listener.1.yield(.status(status))
        }
    }

    func refresh() {
        for (_, listener) in listeners {
            listener.1.yield(.refresh)
        }
    }

    func stop(_ id: UUID) {
        timers.removeValue(forKey: id)?.cancel()
        listeners.removeValue(forKey: id)?.1.finish()
    }

    func signals(mediaId: String, initialDelay: Duration = .seconds(20)) -> (id: UUID, stream: AsyncStream<Signal>) {
        let id = UUID()
        let (stream, continuation) = AsyncStream<Signal>.makeStream()
        listeners[id] = (mediaId, continuation)
        let timer = Task {
            do {
                try await Task.sleep(for: initialDelay)
                while !Task.isCancelled {
                    continuation.yield(.refresh)
                    try await Task.sleep(for: .seconds(10))
                }
            } catch {}
        }
        continuation.onTermination = { [weak self] _ in
            timer.cancel()
            Task { @MainActor in self?.stop(id) }
        }
        timers[id] = timer
        return (id, stream)
    }
}
