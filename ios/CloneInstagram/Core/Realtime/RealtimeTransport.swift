import Foundation

/// Boundary for deterministic connection and lifecycle tests (ADR-021).
protocol RealtimeTransport: AnyObject {
    var closeCode: Int { get }
    func send(_ message: String) async throws
    func receive() async throws -> String
    func close()
}

final class URLSessionRealtimeTransport: RealtimeTransport {
    private let task: URLSessionWebSocketTask

    init(url: URL, session: URLSession = .shared) {
        task = session.webSocketTask(with: url)
        task.resume()
    }

    var closeCode: Int {
        task.closeCode.rawValue
    }

    func send(_ message: String) async throws {
        try await task.send(.string(message))
    }

    func receive() async throws -> String {
        switch try await task.receive() {
        case let .string(text): return text
        case let .data(data): return String(data: data, encoding: .utf8) ?? ""
        @unknown default: return ""
        }
    }

    func close() {
        task.cancel(with: .goingAway, reason: nil)
    }
}
