import Testing
@testable import CloneInstagram

struct HealthViewModelTests {
    @Test func `état initial au repos`() {
        let viewModel = HealthViewModel(service: FakeHealthService(results: []))

        #expect(viewModel.state == .idle)
    }

    @Test func `chargement réussi`() async {
        let viewModel = HealthViewModel(service: FakeHealthService(results: [.success(.ok)]))

        await viewModel.load()

        #expect(viewModel.state == .loaded(.ok))
    }

    @Test(arguments: [
        HealthServiceError.unreachable,
        .misconfigured,
        .unexpectedResponse(statusCode: 500),
    ])
    func `échec affiche un message`(error: HealthServiceError) async {
        let viewModel = HealthViewModel(service: FakeHealthService(results: [.failure(error)]))

        await viewModel.load()

        guard case let .failed(message) = viewModel.state else {
            Issue.record("État attendu : failed, obtenu : \(viewModel.state)")
            return
        }
        #expect(!message.isEmpty)
    }

    @Test func `réessayer après un échec`() async {
        let viewModel = HealthViewModel(service: FakeHealthService(results: [.failure(.unreachable), .success(.ok)]))

        await viewModel.load()
        await viewModel.load()

        #expect(viewModel.state == .loaded(.ok))
    }
}

private final class FakeHealthService: HealthService {
    private var results: [Result<HealthStatus, HealthServiceError>]

    init(results: [Result<HealthStatus, HealthServiceError>]) {
        self.results = results
    }

    func fetchStatus() async throws(HealthServiceError) -> HealthStatus {
        guard !results.isEmpty else { throw .unreachable }
        return try results.removeFirst().get()
    }
}
