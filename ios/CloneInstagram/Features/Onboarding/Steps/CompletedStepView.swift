import SwiftUI

/// Compte prêt (ADR-038) : la mascotte Bravo sous les confettis, puis le paywall.
struct CompletedStepView: View {
    let viewModel: OnboardingViewModel
    @State private var confetti = 0
    @Environment(\.feedback) private var feedback

    var body: some View {
        OnboardingStepLayout(
            title: "Bienvenue sur Clone, \(viewModel.profile?.username ?? "")",
            subtitle: "Votre compte est prêt.",
            mascot: .bravo,
            primaryTitle: "Continuer",
            primaryAction: viewModel.finish
        ) {
            EmptyView()
        }
        .overlay { ConfettiView(trigger: confetti).ignoresSafeArea() }
        .navigationBarBackButtonHidden()
        .onAppear {
            feedback.play(.success)
            confetti += 1
        }
    }
}
