import SwiftUI

/// Pré-permission des notifications après le paywall de fin d'onboarding (ADR-038) : la mascotte explique
/// l'intérêt, puis la demande système ; « Plus tard » ne demande rien (la demande système reste disponible).
struct NotificationPermissionView: View {
    let notifications: any NotificationPermissionService
    let analytics: any AnalyticsService
    let onFinished: () -> Void
    @State private var isAsking = false
    @Environment(\.feedback) private var feedback

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            MascotView(pose: .guide, size: 220)
            VStack(spacing: 8) {
                Text("Je te préviens quand tes amis postent ?")
                    .font(.onboardingTitle(.title))
                Text("Likes, commentaires, nouveaux abonnés : ne rate rien de ce qui compte pour toi.")
                    .font(.onboardingBody())
                    .foregroundStyle(Color.onboardingSecondaryText)
            }
            .multilineTextAlignment(.center)
            Spacer()
            VStack(spacing: 4) {
                Button("Oui, préviens-moi", action: ask)
                    .buttonStyle(.onboardingPrimary)
                    .disabled(isAsking)
                Button("Plus tard", action: onFinished)
                    .buttonStyle(.onboardingSecondary)
                    .disabled(isAsking)
            }
        }
        .padding(24)
        .onboardingScreen()
        .onAppear {
            analytics.track(.onboardingScreenViewed(.notificationPermission))
            feedback.play(.chime)
        }
    }

    private func ask() {
        isAsking = true
        Task {
            let granted = await notifications.request()
            analytics.track(.notificationPermissionResponded(granted: granted))
            feedback.play(granted ? .success : .tap)
            onFinished()
        }
    }
}
