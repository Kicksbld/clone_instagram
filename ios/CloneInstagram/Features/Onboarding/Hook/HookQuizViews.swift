import SwiftUI

/// Quiz 1 : centres d'intérêt, plusieurs réponses.
struct HookInterestsQuizView: View {
    let viewModel: OnboardingHookViewModel

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", isPrimaryEnabled: viewModel.canContinue, primaryAction: viewModel.next) {
            HookQuizHeader(title: "Tu aimes partager quoi ?", subtitle: "Choisis tout ce qui te ressemble.")
            VStack(spacing: 10) {
                ForEach(OnboardingInterest.allCases, id: \.self) { interest in
                    ChoiceChip(
                        title: interest.title,
                        symbol: interest.symbol,
                        isSelected: viewModel.interests.contains(interest)
                    ) {
                        viewModel.toggle(interest)
                    }
                }
            }
        }
    }
}

/// Quiz 2 : ce qu'il pense publier, une réponse.
struct HookStyleQuizView: View {
    let viewModel: OnboardingHookViewModel

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", isPrimaryEnabled: viewModel.canContinue, primaryAction: viewModel.next) {
            HookQuizHeader(title: "Tu es plutôt…", subtitle: "Pas de mauvaise réponse.")
            VStack(spacing: 10) {
                ForEach(OnboardingPostingStyle.allCases, id: \.self) { style in
                    ChoiceChip(title: style.title, symbol: style.symbol, isSelected: viewModel.postingStyle == style) {
                        viewModel.choose(style)
                    }
                }
            }
        }
    }
}

/// Quiz 3 : rythme de publication, une réponse, réaction immédiate de la mascotte.
struct HookRhythmQuizView: View {
    let viewModel: OnboardingHookViewModel

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", isPrimaryEnabled: viewModel.canContinue, primaryAction: viewModel.next) {
            HookQuizHeader(title: "Ton rythme ?", subtitle: "À quelle fréquence penses-tu publier ?")
            VStack(spacing: 10) {
                ForEach(OnboardingRhythm.allCases, id: \.self) { rhythm in
                    ChoiceChip(title: rhythm.title, symbol: rhythm.symbol, isSelected: viewModel.rhythm == rhythm) {
                        viewModel.choose(rhythm)
                    }
                }
            }
            if let reaction = viewModel.rhythmReaction {
                Text(reaction)
                    .font(.onboardingBody(.headline, weight: .bold))
                    .foregroundStyle(Color.cloneLime)
                    .multilineTextAlignment(.center)
                    .id(reaction)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.5), value: viewModel.rhythm)
    }
}

/// En-tête d'une question : la mascotte Guide, petite, au-dessus de la question.
private struct HookQuizHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            MascotView(pose: .guide, size: 140)
            HookTitle(text: title, subtitle: subtitle)
        }
    }
}
