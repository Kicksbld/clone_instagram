import Observation
import SwiftUI

@Observable
final class StoryDescriptionViewModel {
    var text: String
    private(set) var isSaving = false
    var errorMessage: String?
    private let storyId: String
    private let service: any StoryService
    private let onSaved: (Story) -> Void

    init(story: Story, service: any StoryService, onSaved: @escaping (Story) -> Void) {
        text = story.photo.altText ?? ""
        storyId = story.id
        self.service = service
        self.onSaved = onSaved
    }

    func save() async -> Bool {
        guard !isSaving else { return false }
        guard text.unicodeScalars.count <= 1000 else {
            errorMessage = "La description est limitée à 1 000 caractères."
            return false
        }
        errorMessage = nil
        isSaving = true
        defer { isSaving = false }
        do {
            let updated = try await service.updateDescription(storyId: storyId, altText: text)
            onSaved(updated)
            AccessibilityFeedback.announce("Description de la story modifiée")
            return true
        } catch {
            errorMessage = error == .storyNotFound ? "Cette story n’est plus disponible."
                : "La description n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez."
            return false
        }
    }
}

struct StoryDescriptionView: View {
    @State var viewModel: StoryDescriptionViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                AltTextField(text: $viewModel.text).disabled(viewModel.isSaving)
            }
            .navigationTitle("Description de la story")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }.disabled(viewModel.isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(viewModel.isSaving ? "Enregistrement…" : "Enregistrer") {
                        Task {
                            if await viewModel.save() {
                                dismiss()
                            }
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            }
            .interactiveDismissDisabled(viewModel.isSaving)
            .alert("Modification impossible", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: {
                    if !$0 {
                        viewModel.errorMessage = nil
                    }
                }
            )) { Button("OK", role: .cancel) {} } message: { Text(viewModel.errorMessage ?? "") }
        }
    }
}
