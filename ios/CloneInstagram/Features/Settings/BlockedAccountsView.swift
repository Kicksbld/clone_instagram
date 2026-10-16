import SwiftUI

/// Paramètres > Comptes bloqués (wireframe, comme Instagram).
struct BlockedAccountsView: View {
    @State private var viewModel: BlockedAccountsViewModel
    /// Compte à débloquer, en attente de confirmation.
    @State private var userToUnblock: UserSummary?

    init(viewModel: BlockedAccountsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Comptes bloqués")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .confirmationDialog(
                "Débloquer \(userToUnblock?.username ?? "") ?",
                isPresented: Binding(
                    get: { userToUnblock != nil },
                    set: {
                        if !$0 {
                            userToUnblock = nil
                        }
                    }
                ),
                titleVisibility: .visible,
                presenting: userToUnblock
            ) { user in
                Button("Débloquer") { Task { await viewModel.toggleBlock(user) } }
                Button("Annuler", role: .cancel) {}
            } message: { _ in
                Text("Ce compte pourra voir vos publications et vous suivre. Il ne sera pas informé que vous l'avez débloqué.")
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
        switch viewModel.state {
        case .loading:
            ProgressView()
        case .loaded where viewModel.users.isEmpty:
            ContentUnavailableView(
                "Aucun compte bloqué",
                systemImage: "hand.raised",
                description: Text("Les comptes que vous bloquez ne peuvent plus voir votre profil ni vos publications.")
            )
        case .loaded:
            List {
                ForEach(viewModel.users) { user in
                    UserRow(user: user) { button(for: user) }
                        .task {
                            if user.id == viewModel.users.last?.id {
                                await viewModel.loadMore()
                            }
                        }
                }
                if viewModel.hasMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        case let .failed(message):
            ContentUnavailableView {
                Label("Comptes bloqués indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }

    @ViewBuilder
    private func button(for user: UserSummary) -> some View {
        if viewModel.isBlocked(user) {
            Button("Débloquer") { userToUnblock = user }
                .buttonStyle(.bordered)
        } else {
            Button("Bloquer") { Task { await viewModel.toggleBlock(user) } }
                .buttonStyle(.borderedProminent)
        }
    }
}
