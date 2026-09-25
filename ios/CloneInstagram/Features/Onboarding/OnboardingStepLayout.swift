import SwiftUI

/// Gabarit d'une étape (wireframe) : titre, explication, un champ, erreur, bouton principal en bas.
struct OnboardingStepLayout<Content: View, Secondary: View>: View {
    let title: String
    var subtitle: String?
    var primaryTitle = "Suivant"
    var isPrimaryEnabled = true
    var isLoading = false
    var errorMessage: String?
    let primaryAction: () async -> Void
    @ViewBuilder let content: Content
    @ViewBuilder var secondary: Secondary

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.title2.bold())
            if let subtitle {
                Text(subtitle)
                    .foregroundStyle(.secondary)
            }
            content
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle")
                    .font(.footnote)
            }
            Spacer()
            Button {
                Task { await primaryAction() }
            } label: {
                Group {
                    if isLoading {
                        ProgressView()
                    } else {
                        Text(primaryTitle)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(!isPrimaryEnabled || isLoading)
            secondary
                .frame(maxWidth: .infinity)
        }
        .padding()
    }
}

extension OnboardingStepLayout where Secondary == EmptyView {
    init(
        title: String,
        subtitle: String? = nil,
        primaryTitle: String = "Suivant",
        isPrimaryEnabled: Bool = true,
        isLoading: Bool = false,
        errorMessage: String? = nil,
        primaryAction: @escaping () async -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            title: title,
            subtitle: subtitle,
            primaryTitle: primaryTitle,
            isPrimaryEnabled: isPrimaryEnabled,
            isLoading: isLoading,
            errorMessage: errorMessage,
            primaryAction: primaryAction,
            content: content,
            secondary: { EmptyView() }
        )
    }
}
