import SwiftUI

/// Avancement dans le parcours (0 à 1), animé à chaque écran.
struct OnboardingProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            Capsule()
                .fill(Color.onboardingSurface)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(Color.cloneLime)
                        .frame(width: max(8, proxy.size.width * min(max(progress, 0), 1)))
                }
        }
        .frame(height: 8)
        .animation(.spring(duration: 0.5, bounce: 0.3), value: progress)
        .accessibilityElement()
        .accessibilityLabel("Progression")
        .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0))))
    }
}
