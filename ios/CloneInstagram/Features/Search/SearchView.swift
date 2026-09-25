import SwiftUI

/// Onglet Recherche (wireframe) : champ système, résultats avatar + username + nom ; toucher un
/// résultat ouvre le profil (`ProfileRoute`, destination fournie par le routeur racine).
struct SearchView: View {
    @State private var viewModel: SearchViewModel

    init(viewModel: SearchViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Recherche")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $viewModel.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Rechercher"
            )
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .task(id: viewModel.normalizedQuery) {
                // Requête lancée 300 ms après la dernière frappe ; une frappe annule l'attente.
                if !viewModel.normalizedQuery.isEmpty {
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled else { return }
                }
                await viewModel.search()
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle:
            ContentUnavailableView(
                "Rechercher des comptes",
                systemImage: "magnifyingglass",
                description: Text("Par nom d'utilisateur ou par nom.")
            )
        case .searching:
            ProgressView()
        case let .results(users) where users.isEmpty:
            ContentUnavailableView.search(text: viewModel.normalizedQuery)
        case let .results(users):
            List(users) { user in
                NavigationLink(value: ProfileRoute(username: user.username)) {
                    UserRow(user: user, detail: user.isFollowing ? "Suivi(e)" : nil)
                }
            }
            .listStyle(.plain)
        case let .failed(message):
            ContentUnavailableView {
                Label("Recherche indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.search() } }
            }
        }
    }
}
