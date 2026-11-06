import LiveSDK
import LiveSDKUI
import SwiftUI

/// Lives communs aux clones (echimine/live-sdk) : liste, lancement et Live plein écran.
/// Écrans fournis par `LiveSDKUI` ; la navigation reste à l'app.
struct LiveHubView: View {
    let onClose: () -> Void

    @State private var screen: Screen?

    private enum Screen: Identifiable {
        case launch
        case live(String)
        /// Live que je viens de lancer : la session de l'Hôte est gardée, pas rouverte.
        case hosted(LiveSession)

        var id: String {
            switch self {
            case .launch: "launch"
            case let .live(id): "live-\(id)"
            case let .hosted(session): "hosted-\(session.id)"
            }
        }
    }

    var body: some View {
        NavigationStack {
            LiveListScreen(
                onOpenLive: { screen = .live($0) },
                onLaunch: { screen = .launch }
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Fermer", systemImage: "xmark", action: onClose)
                }
            }
        }
        .fullScreenCover(item: $screen) { current in
            Group {
                switch current {
                case .launch:
                    LiveLaunchScreen(
                        onLaunched: { screen = .hosted($0) },
                        onClose: { screen = nil }
                    )
                case let .live(id):
                    LiveScreen(liveId: id, onClose: { screen = nil })
                case let .hosted(session):
                    LiveScreen(session: session, onClose: { screen = nil })
                }
            }
            .liveTheme(Self.theme)
        }
        .liveTheme(Self.theme)
    }

    private static let theme = LiveTheme(label: "Clone Live")
}
