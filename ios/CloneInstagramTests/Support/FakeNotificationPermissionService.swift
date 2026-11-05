@testable import CloneInstagram

/// Faux `NotificationPermissionService` : état programmable, demandes comptées.
final class FakeNotificationPermissionService: NotificationPermissionService {
    var current: NotificationPermissionStatus
    var grants = true
    private(set) var requestCount = 0

    init(current: NotificationPermissionStatus = .notDetermined) {
        self.current = current
    }

    func status() async -> NotificationPermissionStatus {
        current
    }

    func request() async -> Bool {
        requestCount += 1
        current = grants ? .granted : .denied
        return grants
    }
}
