import SwiftUI

/// Écran technique de T0b : affiche l'état de `GET /health`.
struct HealthView: View {
    @State private var viewModel: HealthViewModel
    private let apiBaseURL: URL?

    init(viewModel: HealthViewModel, apiBaseURL: URL?) {
        _viewModel = State(initialValue: viewModel)
        self.apiBaseURL = apiBaseURL
    }

    var body: some View {
        VStack(spacing: 24) {
            statusContent
                .frame(maxWidth: .infinity, minHeight: 160)

            if let apiBaseURL {
                LabeledContent("API", value: apiBaseURL.absoluteString)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button("Réessayer") {
                Task { await viewModel.load() }
            }
            .buttonStyle(.glass)
            .disabled(viewModel.state == .loading)
        }
        .padding()
        .navigationTitle("État de l'API")
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var statusContent: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView("Connexion à l'API…")
        case .loaded(.ok):
            ContentUnavailableView(
                "API disponible",
                systemImage: "checkmark.circle.fill",
                description: Text("GET /health a répondu « ok ».")
            )
            .symbolRenderingMode(.multicolor)
        case let .failed(message):
            ContentUnavailableView(
                "API injoignable",
                systemImage: "exclamationmark.triangle.fill",
                description: Text(message)
            )
        }
    }
}

#Preview("Disponible") {
    NavigationStack {
        HealthView(
            viewModel: HealthViewModel(service: PreviewHealthService(result: .success(.ok))),
            apiBaseURL: URL(string: "http://localhost:3000")
        )
    }
}

#Preview("Injoignable") {
    NavigationStack {
        HealthView(
            viewModel: HealthViewModel(service: PreviewHealthService(result: .failure(.unreachable))),
            apiBaseURL: URL(string: "http://localhost:3000")
        )
    }
}

private struct PreviewHealthService: HealthService {
    let result: Result<HealthStatus, HealthServiceError>

    func fetchStatus() async throws(HealthServiceError) -> HealthStatus {
        try result.get()
    }
}
