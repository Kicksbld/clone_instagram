import SwiftUI

/// Bouton principal : capsule citron, enfoncement animé, repère `tap` à l'appui.
struct OnboardingPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PressFeedback(configuration: configuration) {
            configuration.label
                .font(.onboardingBody(.headline, weight: .bold))
                .foregroundStyle(Color.onboardingBackground)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(Color.cloneLime, in: .capsule)
        }
    }
}

/// Bouton secondaire : texte clair sur fond transparent.
struct OnboardingSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PressFeedback(configuration: configuration, cue: nil) {
            configuration.label
                .font(.onboardingBody(.subheadline, weight: .semibold))
                .foregroundStyle(Color.onboardingSecondaryText)
                .frame(minHeight: 44)
                .contentShape(.rect)
        }
    }
}

extension ButtonStyle where Self == OnboardingPrimaryButtonStyle {
    static var onboardingPrimary: OnboardingPrimaryButtonStyle {
        OnboardingPrimaryButtonStyle()
    }
}

extension ButtonStyle where Self == OnboardingSecondaryButtonStyle {
    static var onboardingSecondary: OnboardingSecondaryButtonStyle {
        OnboardingSecondaryButtonStyle()
    }
}

/// Enfoncement et estompage du bouton désactivé ; repère joué à l'appui.
private struct PressFeedback<Content: View>: View {
    let configuration: ButtonStyleConfiguration
    var cue: FeedbackCue? = .tap
    @ViewBuilder let content: Content
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.feedback) private var feedback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        content
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.5), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed, let cue {
                    feedback.play(cue)
                }
            }
    }
}
