import SwiftUI

/// Routeur racine. En T0b, seul l'écran d'état de l'API existe (auth et onboarding : T2).
struct RootView: View {
    let dependencies: AppDependencies

    var body: some View {
        NavigationStack {
            HealthView(
                viewModel: HealthViewModel(service: dependencies.healthService),
                apiBaseURL: try? dependencies.apiConfiguration.get().baseURL
            )
        }
    }
}
