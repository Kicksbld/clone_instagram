import SwiftUI

/// Onglet Recherche (wireframe) : champ système, résultats avatar + username + nom ; toucher un
/// résultat ouvre le profil (`ProfileRoute`, destination fournie par le routeur racine).
struct SearchView: View {
    @State private var viewModel: SearchViewModel
    @Environment(\.blockedUserIds) private var blockedUserIds

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
            .accessibilityStatus(searchStatus)
            .onChange(of: blockedUserIds) { viewModel.hideUsers(blockedUserIds) }
    }

    private var searchStatus: String {
        switch viewModel.state {
        case let .results(users): "\(users.count) résultats"
        case let .failed(message): message
        default: ""
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
            ProgressView().accessibilityLabel("Chargement en cours")
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
