import LiveSDK
import SwiftUI

@main
struct CloneInstagramApp: App {
    private let dependencies = AppDependencies.live()

    var body: some Scene {
        WindowGroup {
            RootView(dependencies: dependencies)
                .task { await configureLive() }
        }
        // Upload terminé pendant que l'app était suspendue ou fermée (ADR-008).
        .backgroundTask(.urlSession(BackgroundFileUploader.sessionIdentifier)) {
            await BackgroundFileUploader.shared.handleBackgroundEvents()
        }
    }

    /// Live commun aux clones : jeton de Participant demandé à l'API à chaque connexion.
    private func configureLive() async {
        guard let liveToken = dependencies.liveToken else { return }
        await LiveSDK.shared.configure(serverURL: LiveServer.url) {
            try await liveToken.participantToken()
        }
    }
}
