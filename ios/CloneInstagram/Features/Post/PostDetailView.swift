import SwiftUI

/// Détail d'un post (wireframe, comme Instagram) : auteur et menu « … », photos (carrousel) au ratio de la
/// première, actions (J'aime, Commenter), mentions J'aime, légende, lien vers les commentaires et date.
struct PostDetailView: View {
    @State private var viewModel: PostDetailViewModel
    @State private var isConfirmingDelete = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.blockedUserIds) private var blockedUserIds

    init(viewModel: PostDetailViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Publications")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            // Auteur bloqué depuis le menu « … » : le post devient invisible, retour à l'écran précédent.
            .onChange(of: blockedUserIds) {
                if case let .loaded(post) = viewModel.state, blockedUserIds.contains(post.author.id) {
                    dismiss()
                }
            }
            .alert("Supprimer la publication ?", isPresented: $isConfirmingDelete) {
                // Suppression optimiste : l'écran se ferme tout de suite, un échec s'affiche depuis `App`.
                Button("Supprimer", role: .destructive) {
                    Task { await viewModel.delete() }
                    dismiss()
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Cette publication sera définitivement supprimée.")
            }
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.likeErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.likeErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.likeErrorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
        case let .loaded(post):
            ScrollView {
                PostView(
                    post: viewModel.displayed(post),
                    onDelete: viewModel.canDelete ? { isConfirmingDelete = true } : nil,
                    onToggleLike: { Task { await viewModel.toggleLike() } },
                    onDoubleTapLike: { Task { await viewModel.likeFromDoubleTap() } }
                )
            }
            .refreshable { await viewModel.load() }
        case .notFound:
            ContentUnavailableView(
                "Cette publication n'est pas disponible",
                systemImage: "photo.badge.exclamationmark",
                description: Text("Le lien est peut-être rompu, ou la publication a été supprimée.")
            )
        case let .failed(message):
            ContentUnavailableView {
                Label("Publication indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }
}
