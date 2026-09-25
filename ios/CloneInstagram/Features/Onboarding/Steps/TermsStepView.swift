import SwiftUI

struct TermsStepView: View {
    let viewModel: OnboardingViewModel
    @State private var shownDocument: LegalDocument?

    var body: some View {
        OnboardingStepLayout(
            title: "Acceptez les conditions et les politiques",
            subtitle: """
            En touchant « J'accepte », vous acceptez de créer un compte et nos conditions, \
            notre politique de confidentialité et notre politique relative aux cookies.
            """,
            primaryTitle: "J'accepte",
            isLoading: viewModel.isLoading,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.acceptTerms
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(LegalDocument.allCases) { document in
                    Button(document.title) { shownDocument = document }
                }
            }
        }
        .sheet(item: $shownDocument) { document in
            NavigationStack {
                ContentUnavailableView(document.title, systemImage: "doc.text", description: Text("Document à rédiger."))
                    .toolbar {
                        Button("Fermer") { shownDocument = nil }
                    }
            }
        }
    }
}

private enum LegalDocument: String, CaseIterable, Identifiable {
    case terms
    case privacy
    case cookies

    var id: Self {
        self
    }

    var title: String {
        switch self {
        case .terms: "Conditions d'utilisation"
        case .privacy: "Politique de confidentialité"
        case .cookies: "Politique relative aux cookies"
        }
    }
}
