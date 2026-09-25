import SwiftUI

/// Écran d'arrivée (wireframe) : créer un compte ou se connecter.
struct WelcomeView: View {
    let onSignUp: () -> Void
    let onLogin: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            AppLogo()
            Text("Bienvenue sur Clone")
                .font(.title2.bold())
            Text("Partagez vos photos et suivez vos amis.")
                .foregroundStyle(.secondary)
            Spacer()
            Button(action: onSignUp) {
                Text("Commencer").frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            Button("J'ai déjà un compte", action: onLogin)
        }
        .multilineTextAlignment(.center)
        .padding()
    }
}
