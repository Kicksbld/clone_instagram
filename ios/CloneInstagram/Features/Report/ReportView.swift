import SwiftUI

/// Feuille « Signaler » (wireframe, comme Instagram) : motifs, précisions pour « Autre chose », puis
/// « Merci de nous l'avoir signalé » avec « Bloquer @x ».
struct ReportView: View {
    @State private var viewModel: ReportViewModel
    @Environment(\.dismiss) private var dismiss

    init(viewModel: ReportViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Signaler")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        if viewModel.step == .choosing {
                            Button("Annuler", systemImage: "xmark") { dismiss() }
                        }
                    }
                }
                .navigationDestination(isPresented: $viewModel.isEnteringDetails) { detailsForm }
        }
        .interactiveDismissDisabled(viewModel.isSending)
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
        switch viewModel.step {
        case .choosing:
            reasons
        case .sent:
            thanks
        case .targetGone:
            ContentUnavailableView {
                Label("Ce contenu n'est plus disponible", systemImage: "exclamationmark.triangle")
            } description: {
                Text("Il a peut-être été supprimé.")
            } actions: {
                Button("Fermer") { dismiss() }
            }
        }
    }

    private var reasons: some View {
        List {
            Section {
                ForEach(ReportReason.allCases) { reason in
                    Button {
                        Task { await viewModel.select(reason) }
                    } label: {
                        HStack {
                            Text(reason.title)
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .disabled(viewModel.isSending)
                }
            } header: {
                Text(viewModel.question)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .textCase(nil)
            } footer: {
                Text("Votre signalement est anonyme. Si quelqu'un est en danger immédiat, contactez les services d'urgence.")
            }
        }
        .overlay {
            if viewModel.isSending {
                ProgressView()
            }
        }
    }

    private var detailsForm: some View {
        Form {
            Section {
                TextField("Ajouter des précisions", text: $viewModel.details, axis: .vertical)
                    .lineLimit(4 ... 10)
            } header: {
                Text("Que se passe-t-il ?")
            } footer: {
                Text("\(viewModel.trimmedDetails.count) / \(ReportViewModel.maxDetailsLength)")
            }
        }
        .navigationTitle("Autre chose")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if viewModel.isSending {
                    ProgressView()
                } else {
                    Button("Envoyer") { Task { await viewModel.sendDetails() } }
                        .disabled(!viewModel.canSendDetails)
                }
            }
        }
    }

    private var thanks: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle")
                        .font(.largeTitle)
                    Text("Merci de nous l'avoir signalé")
                        .font(.headline)
                    Text("Votre avis nous aide à assurer la sécurité de la communauté.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical)
            }
            Section {
                blockRow
            }
            Section {
                Button("Terminé") { dismiss() }
                    .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private var blockRow: some View {
        let username = viewModel.route.author.username
        switch viewModel.blockState {
        case .idle:
            Button("Bloquer \(username)", systemImage: "hand.raised", role: .destructive) {
                Task { await viewModel.blockAuthor() }
            }
        case .blocked:
            Label("Vous avez bloqué \(username)", systemImage: "checkmark")
                .foregroundStyle(.secondary)
        }
    }
}
