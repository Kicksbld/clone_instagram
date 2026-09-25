import SwiftUI

struct CompletedStepView: View {
    let viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Bienvenue sur Clone, \(viewModel.profile?.username ?? "")",
            subtitle: "Votre compte est prêt.",
            primaryTitle: "Continuer",
            primaryAction: viewModel.finish
        ) {
            EmptyView()
        }
        .navigationBarBackButtonHidden()
    }
}
