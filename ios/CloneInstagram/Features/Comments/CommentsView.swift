import SwiftUI

/// Feuille « Commentaires » (wireframe, comme Instagram) : commentaires du plus récent au plus ancien, réponses
/// repliables, « Répondre », suppression par glissement, champ de saisie en bas.
struct CommentsView: View {
    @State private var viewModel: CommentsViewModel
    @FocusState private var isFieldFocused: Bool

    init(viewModel: CommentsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Commentaires")
                .navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom) {
                    if viewModel.state == .loaded {
                        composer
                    }
                }
        }
        .task { await viewModel.load() }
        .alert(
            "Action impossible",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: {
                    if !$0 {
                        viewModel.errorMessage = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .postGone:
            ContentUnavailableView(
                "Cette publication n'est pas disponible",
                systemImage: "photo.badge.exclamationmark",
                description: Text("La publication a peut-être été supprimée.")
            )
        case let .failed(message):
            ContentUnavailableView {
                Label("Commentaires indisponibles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        case .loaded where viewModel.threads.isEmpty:
            ContentUnavailableView(
                "Aucun commentaire pour le moment",
                systemImage: "bubble.left.and.bubble.right",
                description: Text("Lancez la conversation.")
            )
        case .loaded:
            list
        }
    }

    private var list: some View {
        List {
            ForEach(viewModel.threads) { thread in
                row(thread.comment)
                    .task { await viewModel.commentAppeared(thread.comment) }
                if thread.isExpanded {
                    ForEach(thread.replies) { reply in
                        row(reply)
                            .padding(.leading, 44)
                    }
                }
                if thread.isLoadingReplies {
                    ProgressView()
                        .padding(.leading, 44)
                        .listRowSeparator(.hidden)
                } else {
                    repliesToggle(thread)
                }
            }
            if viewModel.isLoadingMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .refreshable { await viewModel.load() }
    }

    /// Avatar, username, date, texte et « Répondre » ; glisser pour supprimer si je le peux.
    private func row(_ comment: Comment) -> some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(avatar: comment.author.avatar, size: 32)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.author.username)
                        .font(.footnote.weight(.semibold))
                    if comment.isPending {
                        Text("Publication…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(comment.createdAt, format: .relative(presentation: .named))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(comment.body)
                    .font(.subheadline)
                if !comment.isPending {
                    Button("Répondre") {
                        viewModel.reply(to: comment)
                        isFieldFocused = true
                    }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .opacity(comment.isPending ? 0.5 : 1)
        .listRowSeparator(.hidden)
        .swipeActions(edge: .trailing) {
            if comment.canDelete, !comment.isPending {
                Button("Supprimer", systemImage: "trash", role: .destructive) {
                    Task { await viewModel.delete(comment) }
                }
            }
        }
    }

    /// « Afficher les N réponses » / « Afficher N autres réponses » / « Masquer les réponses ».
    @ViewBuilder
    private func repliesToggle(_ thread: CommentThread) -> some View {
        let hidden = thread.hiddenReplyCount
        if hidden > 0 {
            Button(repliesLabel(hidden, more: thread.isExpanded)) {
                Task { await viewModel.showReplies(of: thread.id) }
            }
            .modifier(RepliesToggleStyle())
        } else if thread.isExpanded, !thread.replies.isEmpty {
            Button("Masquer les réponses") { viewModel.hideReplies(of: thread.id) }
                .modifier(RepliesToggleStyle())
        }
    }

    private func repliesLabel(_ count: Int, more: Bool) -> String {
        let number = count.formatted()
        return switch (count == 1, more) {
        case (true, false): "Afficher 1 réponse"
        case (true, true): "Afficher 1 autre réponse"
        case (false, false): "Afficher les \(number) réponses"
        case (false, true): "Afficher \(number) autres réponses"
        }
    }

    /// Bandeau « En réponse à @x » puis champ « Ajouter un commentaire… » et « Publier ».
    private var composer: some View {
        VStack(spacing: 0) {
            Divider()
            if let target = viewModel.replyTarget {
                HStack {
                    Text("En réponse à @\(target.username)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Annuler la réponse", systemImage: "xmark") { viewModel.cancelReply() }
                        .labelStyle(.iconOnly)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Ajouter un commentaire…", text: $viewModel.draft, axis: .vertical)
                    .lineLimit(1 ... 5)
                    .focused($isFieldFocused)
                Button("Publier") { Task { await viewModel.send() } }
                    .fontWeight(.semibold)
                    .disabled(!viewModel.canSend)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
        .background(.bar)
    }
}

private struct RepliesToggleStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .buttonStyle(.plain)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.leading, 44)
            .listRowSeparator(.hidden)
    }
}
