import SwiftUI

/// Gabarit d'une étape de l'inscription (ADR-038) : mascotte, titre, explication, un champ, erreur, bouton
/// principal en bas. Fond noir, repère `error` à chaque nouvelle erreur.
struct OnboardingStepLayout<Content: View, Secondary: View>: View {
    let title: String
    var subtitle: String?
    var mascot: MascotPose? = .guide
    var primaryTitle = "Suivant"
    var isPrimaryEnabled = true
    var isLoading = false
    var errorMessage: String?
    let primaryAction: () async -> Void
    @ViewBuilder let content: Content
    @ViewBuilder var secondary: Secondary
    @Environment(\.feedback) private var feedback

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let mascot {
                MascotView(pose: mascot, size: 120)
                    .frame(maxWidth: .infinity)
            }
            Text(title)
                .font(.onboardingTitle(.title))
            if let subtitle {
                Text(subtitle)
                    .font(.onboardingBody())
                    .foregroundStyle(Color.onboardingSecondaryText)
            }
            content
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                    .font(.onboardingBody(.footnote, weight: .semibold))
                    .foregroundStyle(Color.likeRed)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer()
            Button {
                Task { await primaryAction() }
            } label: {
                Group {
                    if isLoading {
                        ProgressView().tint(Color.onboardingBackground)
                    } else {
                        Text(primaryTitle)
                    }
                }
            }
            .buttonStyle(.onboardingPrimary)
            .disabled(!isPrimaryEnabled || isLoading)
            secondary
                .buttonStyle(.onboardingSecondary)
                .frame(maxWidth: .infinity)
        }
        .padding()
        .animation(.spring(duration: 0.3), value: errorMessage)
        .onboardingScreen()
        .onChange(of: errorMessage) { _, message in
            if message != nil {
                feedback.play(.error)
            }
        }
    }
}

extension OnboardingStepLayout where Secondary == EmptyView {
    init(
        title: String,
        subtitle: String? = nil,
        mascot: MascotPose? = .guide,
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
            mascot: mascot,
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
