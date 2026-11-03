import SwiftUI

struct StoryViewersView: View {
    @State private var viewModel: StoryViewersViewModel
    let isPlus: () -> Bool
    @State private var query = ""
    @State private var isShowingPlus = false
    @Environment(\.plusPaywall) private var plusPaywall
    @Environment(\.dismiss) private var dismiss
    @Environment(\.blockedUserIds) private var blockedUserIds

    init(viewModel: StoryViewersViewModel, isPlus: @escaping () -> Bool) {
        _viewModel = State(initialValue: viewModel)
        self.isPlus = isPlus
    }

    var body: some View {
        NavigationStack {
            List {
                if isPlus() {
                    TextField("Rechercher un compte", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    Button("Rechercher avec Clone Plus", systemImage: "magnifyingglass") { isShowingPlus = true }
                }
                ForEach(viewModel.items.filter { !blockedUserIds.contains($0.id) }) { viewer in
                    HStack {
                        AvatarView(avatar: viewer.account.avatar, size: 40)
                        VStack(alignment: .leading) {
                            Text(viewer.account.username)
                            Text(viewer.fullName).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(viewer.viewedAt, style: .relative).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if viewModel.isLoading {
                    ProgressView()
                }
                if let error = viewModel.errorMessage {
                    Text(error)
                    Button("Réessayer") {
                        Task {
                            if viewModel.hasMore {
                                await viewModel.loadMore()
                            } else {
                                await viewModel.load(query: query.isEmpty ? nil : query)
                            }
                        }
                    }
                } else if viewModel.hasMore {
                    Button("Voir plus") { Task { await viewModel.loadMore() } }
                } else if !viewModel.isLoading, viewModel.items.isEmpty {
                    Text(query.isEmpty ? "Aucune vue pour le moment." : "Aucun compte trouvé.")
                }
            }
            .navigationTitle("Vues")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
            .task(id: query) {
                if !query.isEmpty {
                    do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
                }
                await viewModel.load(query: query.isEmpty ? nil : query)
            }
            .onChange(of: viewModel.needsPlus) { _, needed in
                if needed {
                    isShowingPlus = true; viewModel.needsPlus = false
                }
            }
            .sheet(isPresented: $isShowingPlus) { plusPaywall() }
        }
    }
}
