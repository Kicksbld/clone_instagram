import SwiftUI

@main
struct CloneInstagramApp: App {
    private let dependencies = AppDependencies.live()

    var body: some Scene {
        WindowGroup {
            RootView(dependencies: dependencies)
        }
        // Upload terminé pendant que l'app était suspendue ou fermée (ADR-008).
        .backgroundTask(.urlSession(BackgroundFileUploader.sessionIdentifier)) {
            await BackgroundFileUploader.shared.handleBackgroundEvents()
        }
    }
}
