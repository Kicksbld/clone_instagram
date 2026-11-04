import SwiftUI

struct SharePostView: View {
    @State private var viewModel: SharePostViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.blockedUserIds) private var blockedUserIds

    init(viewModel: SharePostViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Destinataires") {
                    if viewModel.discovery.query.isEmpty {
                        ForEach(recentConversations) { conversation in
                            recipient(conversation.otherMember)
                        }
                        if viewModel.discovery.store.nextConversationCursor != nil {
                            Button("Conversations précédentes") { Task { await viewModel.discovery.store.refresh(loadMore: true) } }
                        }
                        if viewModel.discovery.store.conversations.isEmpty {
                            Text("Recherchez un compte pour lui envoyer ce post.")
                        }
                    } else {
                        ForEach(viewModel.discovery.results.filter { !blockedUserIds.contains($0.id) }) { user in
                            recipient(PostAuthor(id: user.id, username: user.username, avatar: user.avatar))
                        }
                    }
                    if let error = viewModel.discovery.searchError {
                        Text(error)
                        Button("Réessayer la recherche") { Task { await viewModel.discovery.search() } }
                    }
                }
                if !viewModel.selected.isEmpty {
                    Section("Sélection") {
                        ForEach(viewModel.selected, id: \.id) { user in
                            HStack {
                                Text(user.username)
                                Spacer()
                                switch viewModel.attempts[user.id]?.state {
                                case .sending: Text("Envoi…")
                                case .sent: Label("Envoyé", systemImage: "checkmark")
                                case .failed:
                                    Button("Non envoyé — Réessayer") { Task { await viewModel.retry(userId: user.id) } }
                                case nil:
                                    Button("Retirer", systemImage: "minus.circle") { viewModel.toggle(user) }
                                        .labelStyle(.iconOnly)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Partager le post")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: Binding(get: { viewModel.discovery.query }, set: { viewModel.discovery.query = $0 }),
                prompt: "Rechercher un compte"
            )
            .task(id: viewModel.discovery.query) {
                do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
                await viewModel.discovery.search()
            }
            .task { await viewModel.discovery.store.refresh() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Envoyer") { Task { await viewModel.send() } }
                        .disabled(!viewModel.selected.contains { viewModel.attempts[$0.id] == nil })
                }
            }
            .alert("Partage", isPresented: Binding(get: { viewModel.discovery.store.errorMessage != nil }, set: {
                if !$0 {
                    viewModel.discovery.store.errorMessage = nil
                }
            })) {
                Button("OK", role: .cancel) {}
            } message: { Text(viewModel.discovery.store.errorMessage ?? "") }
        }
    }

    private var recentConversations: [Conversation] {
        viewModel.discovery.store.conversations.filter { !blockedUserIds.contains($0.otherMember.id) }
    }

    private func recipient(_ user: PostAuthor) -> some View {
        Button { viewModel.toggle(user) } label: {
            HStack {
                AvatarView(avatar: user.avatar, size: 32)
                Text(user.username)
                Spacer()
                if viewModel.selected.contains(where: { $0.id == user.id }) {
                    Image(systemName: "checkmark.circle.fill")
                }
            }
        }
        .accessibilityAddTraits(viewModel.selected.contains(where: { $0.id == user.id }) ? .isSelected : [])
    }
}
