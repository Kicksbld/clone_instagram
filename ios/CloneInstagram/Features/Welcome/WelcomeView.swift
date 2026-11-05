import SwiftUI

/// Écran d'arrivée, premier écran du parcours (ADR-038) : la mascotte salue, « Commencer » ou se connecter.
struct WelcomeView: View {
    let onSignUp: () -> Void
    let onLogin: () -> Void
    @State private var isShown = false
    @Environment(\.feedback) private var feedback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 16) {
            AppLogo(size: 56)
                .padding(.top, 24)
            Spacer()
            MascotView(pose: .guide, size: 260)
                .scaleEffect(isShown || reduceMotion ? 1 : 0.5)
                .opacity(isShown || reduceMotion ? 1 : 0)
            VStack(spacing: 8) {
                Text("Bienvenue sur Clone")
                    .font(.onboardingTitle())
                Text("Partagez vos photos et suivez vos amis.")
                    .font(.onboardingBody(.title3))
                    .foregroundStyle(Color.onboardingSecondaryText)
            }
            .offset(y: isShown || reduceMotion ? 0 : 24)
            .opacity(isShown || reduceMotion ? 1 : 0)
            Spacer()
            VStack(spacing: 4) {
                Button("Commencer", action: onSignUp)
                    .buttonStyle(.onboardingPrimary)
                Button("J'ai déjà un compte", action: onLogin)
                    .buttonStyle(.onboardingSecondary)
            }
        }
        .multilineTextAlignment(.center)
        .padding(24)
        .onboardingScreen()
        .onAppear {
            guard !isShown else { return }
            feedback.play(.pop)
            withAnimation(.spring(duration: 0.7, bounce: 0.5).delay(0.15)) { isShown = true }
        }
    }
}
