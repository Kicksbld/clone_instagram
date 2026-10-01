import SwiftUI

/// Détail d'un post (wireframe, comme Instagram) : auteur et menu « … », photos (carrousel) au ratio de la
/// première, actions, légende et date. Les actions (J'aime, Commenter, Partager, Enregistrer) arrivent en T8
/// et T9 : désactivées d'ici là.
struct PostDetailView: View {
    @State private var viewModel: PostDetailViewModel
    @State private var isConfirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(viewModel: PostDetailViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Publications")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .alert("Supprimer la publication ?", isPresented: $isConfirmingDelete) {
                Button("Supprimer", role: .destructive) {
                    Task {
                        if await viewModel.delete() {
                            dismiss()
                        }
                    }
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Cette publication sera définitivement supprimée.")
            }
            .alert(
                "Suppression impossible",
                isPresented: Binding(
                    get: { viewModel.deleteErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.deleteErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.deleteErrorMessage ?? "")
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
                    post: post,
                    isDeleting: viewModel.isDeleting,
                    onDelete: viewModel.canDelete ? { isConfirmingDelete = true } : nil
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
