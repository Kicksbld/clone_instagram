import SwiftUI

/// La mascotte se présente.
struct HookIntroView: View {
    let viewModel: OnboardingHookViewModel
    @State private var isShown = false
    @Environment(\.feedback) private var feedback

    var body: some View {
        HookScaffold(primaryTitle: "Enchanté !", primaryAction: viewModel.next) {
            MascotView(pose: .guide, size: 220)
                .scaleEffect(isShown ? 1 : 0.6)
                .opacity(isShown ? 1 : 0)
            SpeechBubble(text: viewModel.introLine)
        }
        .onAppear {
            feedback.play(.pop)
            withAnimation(.spring(duration: 0.6, bounce: 0.5)) { isShown = true }
        }
    }
}

/// Réplique de la mascotte après une réponse du quiz.
struct HookInsightView: View {
    let text: String
    let action: () -> Void
    @Environment(\.feedback) private var feedback

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", primaryAction: action) {
            Spacer(minLength: 24)
            MascotView(pose: .guide, size: 200)
            SpeechBubble(text: text)
        }
        .onAppear { feedback.play(.chime) }
    }
}

/// Promesse de l'app en trois cartes à faire défiler.
struct HookPromiseView: View {
    let viewModel: OnboardingHookViewModel
    @State private var page = 0
    @Environment(\.feedback) private var feedback

    private let cards: [(symbol: String, title: String, text: String)] = [
        ("camera.aperture", "Partage tes moments", "Photos, carrousels, stories et reels : ton quotidien en un geste."),
        ("person.2.fill", "Retrouve tes amis", "Suis tes proches, like et commente leurs posts, discute en privé."),
        ("sparkles", "Exprime-toi", "Ton profil, ta bio, ton style. Et encore plus avec Clone Plus."),
    ]

    var body: some View {
        HookScaffold(
            primaryTitle: page < cards.count - 1 ? "Suivant" : "C'est parti",
            primaryAction: advance
        ) {
            TabView(selection: $page) {
                ForEach(cards.indices, id: \.self) { index in
                    card(cards[index]).tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .frame(height: 440)
        }
        .onChange(of: page) { feedback.play(.swipe) }
    }

    private func card(_ card: (symbol: String, title: String, text: String)) -> some View {
        VStack(spacing: 20) {
            Image(systemName: card.symbol)
                .font(.system(size: 72, weight: .bold))
                .foregroundStyle(Color.cloneLime)
                .frame(width: 160, height: 160)
                .background(Color.onboardingSurface, in: .circle)
                .symbolEffect(.bounce, value: page)
                .accessibilityHidden(true)
            Text(card.title)
                .font(.onboardingTitle(.title))
            Text(card.text)
                .font(.onboardingBody())
                .foregroundStyle(Color.onboardingSecondaryText)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 8)
        .padding(.bottom, 48)
    }

    private func advance() {
        if page < cards.count - 1 {
            withAnimation { page += 1 }
        } else {
            viewModel.next()
        }
    }
}

/// Célébration : la mascotte Bravo sous les confettis.
struct HookCelebrationView: View {
    let viewModel: OnboardingHookViewModel
    @State private var confetti = 0
    @State private var isShown = false
    @Environment(\.feedback) private var feedback

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", primaryAction: viewModel.next) {
            Spacer(minLength: 24)
            MascotView(pose: .bravo, size: 240)
                .scaleEffect(isShown ? 1 : 0.4)
            HookTitle(text: viewModel.celebrationTitle, subtitle: viewModel.celebrationLine)
        }
        .overlay { ConfettiView(trigger: confetti).ignoresSafeArea() }
        .onAppear {
            feedback.play(.success)
            confetti += 1
            withAnimation(.spring(duration: 0.6, bounce: 0.55)) { isShown = true }
        }
    }
}

/// Pont vers l'inscription : ce qui sera gardé dans le compte.
struct HookBridgeView: View {
    let viewModel: OnboardingHookViewModel

    var body: some View {
        HookScaffold(primaryTitle: "Créer mon compte", primaryAction: viewModel.next) {
            MascotView(pose: .guide, size: 160)
            HookTitle(
                text: "On garde tout ça ?",
                subtitle: "Crée ton compte pour retrouver tes choix et publier pour de vrai."
            )
            VStack(alignment: .leading, spacing: 12) {
                if !viewModel.interests.isEmpty {
                    summaryRow("heart.text.square.fill", viewModel.interests.map(\.title).formatted(.list(type: .and)))
                }
                if viewModel.isPhotoPublished {
                    summaryRow("person.crop.circle.badge.checkmark", "Ta photo, prête pour ton profil")
                }
                summaryRow("bell.badge.fill", "Les nouveautés de tes amis")
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.onboardingSurface, in: .rect(cornerRadius: 24))
        }
    }

    private func summaryRow(_ symbol: String, _ text: String) -> some View {
        Label {
            Text(text).font(.onboardingBody(.body, weight: .semibold))
        } icon: {
            Image(systemName: symbol).foregroundStyle(Color.cloneLime)
        }
    }
}
