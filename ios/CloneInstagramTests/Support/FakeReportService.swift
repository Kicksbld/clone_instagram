import Foundation
@testable import CloneInstagram

/// Faux `ReportService` : erreurs programmables, signalements enregistrés.
final class FakeReportService: ReportService {
    struct Request: Equatable {
        let target: ReportRoute.Target
        let reason: ReportReason
        let details: String?
    }

    /// Erreurs successives ; succès quand la liste est vide.
    var errors: [ReportServiceError] = []
    private(set) var requests: [Request] = []

    func report(_ target: ReportRoute.Target, reason: ReportReason, details: String?) async throws(ReportServiceError) {
        requests.append(Request(target: target, reason: reason, details: details))
        if !errors.isEmpty {
            throw errors.removeFirst()
        }
    }
}
