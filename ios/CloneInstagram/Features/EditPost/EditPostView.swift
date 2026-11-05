import SwiftUI

/// « Modifier les infos » (wireframe, comme Instagram) : légende modifiable, suggestions de mentions,
/// « Annuler » et « OK ». L'enregistrement attend l'API (bouton remplacé par un indicateur), puis l'écran se
/// ferme ; un échec s'affiche en alerte, la saisie est gardée pour réessayer.
struct EditPostView: View {
    @State private var viewModel: EditPostViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isEditing: Bool

    init(viewModel: EditPostViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Ajoutez une légende…", text: $viewModel.caption, axis: .vertical)
                    .lineLimit(5 ... 12)
                    .focused($isEditing)
                    .disabled(viewModel.isSaving)
                MentionSuggestions(text: $viewModel.caption)
            }
            .navigationTitle("Modifier les infos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                        .disabled(viewModel.isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("OK") {
                            Task {
                                if await viewModel.save() {
                                    dismiss()
                                }
                            }
                        }
                        .disabled(!viewModel.hasChanges)
                    }
                }
            }
            .interactiveDismissDisabled(viewModel.isSaving || viewModel.hasChanges)
            .onAppear { isEditing = true }
            .alert(
                "Modification impossible",
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
    }
}
