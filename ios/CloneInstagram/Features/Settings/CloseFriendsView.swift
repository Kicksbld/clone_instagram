import SwiftUI

/// Paramètres > Amis proches (wireframe, comme Instagram) : champ de recherche, ma liste, et « Ajouter » /
/// « Retirer » sur chaque compte, changés tout de suite (ADR-020).
struct CloseFriendsView: View {
    @State private var viewModel: CloseFriendsViewModel

    init(viewModel: CloseFriendsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Amis proches")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $viewModel.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Rechercher"
            )
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .task { await viewModel.load() }
            .task(id: viewModel.normalizedQuery) {
                // Requête lancée 300 ms après la dernière frappe ; une frappe annule l'attente.
                if !viewModel.normalizedQuery.isEmpty {
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled else { return }
                }
                await viewModel.search()
            }
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.actionErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.actionErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.actionErrorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.searchState {
        case .idle:
            list
        case .searching:
            ProgressView().accessibilityLabel("Chargement en cours")
        case let .results(users) where users.isEmpty:
            ContentUnavailableView.search(text: viewModel.normalizedQuery)
        case let .results(users):
            List(users) { user in
                UserRow(user: user) { button(for: user) }
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

    @ViewBuilder
    private var list: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().accessibilityLabel("Chargement en cours")
        case .loaded where viewModel.users.isEmpty:
            ContentUnavailableView(
                "Aucun ami proche",
                systemImage: "star.circle",
                description: Text(
                    "Recherchez des comptes pour les ajouter. Personne n'est prévenu quand vous l'ajoutez ou le retirez."
                )
            )
        case .loaded:
            List {
                Section {
                    ForEach(viewModel.users) { user in
                        UserRow(user: user) { button(for: user) }
                            .task {
                                if user.id == viewModel.users.last?.id {
                                    await viewModel.loadMore()
                                }
                            }
                    }
                    if viewModel.hasMore {
                        ProgressView().accessibilityLabel("Chargement en cours")
                            .frame(maxWidth: .infinity)
                            .listRowSeparator(.hidden)
                    }
                } footer: {
                    Text("Personne n'est prévenu quand vous l'ajoutez à vos amis proches ou l'en retirez.")
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        case let .failed(message):
            ContentUnavailableView {
                Label("Amis proches indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }

    @ViewBuilder
    private func button(for user: UserSummary) -> some View {
        if viewModel.isCloseFriend(user) {
            Button("Retirer") { Task { await viewModel.toggle(user) } }
                .buttonStyle(.bordered)
        } else {
            Button("Ajouter") { Task { await viewModel.toggle(user) } }
                .buttonStyle(.borderedProminent)
        }
    }
}
