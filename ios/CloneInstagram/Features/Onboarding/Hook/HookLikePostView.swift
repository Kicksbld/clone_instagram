import SwiftUI

/// « Learn by doing » : double tap sur un faux post illustré selon le premier centre d'intérêt ; la mascotte
/// Cœur surgit une fois le like fait.
struct HookLikePostView: View {
    let viewModel: OnboardingHookViewModel
    @State private var doubleTaps = 0
    @State private var hint = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HookScaffold(primaryTitle: "Continuer", isPrimaryEnabled: viewModel.canContinue, primaryAction: viewModel.next) {
            HookTitle(
                text: viewModel.hasLiked ? "Trop bien !" : "Double-tape la photo",
                subtitle: viewModel.hasLiked
                    ? "C'est comme ça qu'on montre à ses amis qu'on aime leurs posts."
                    : "C'est le geste le plus utilisé sur Clone. Essaie !"
            )
            post
            if viewModel.hasLiked {
                MascotView(pose: .heart, size: 150)
                    .transition(.scale(scale: 0.3).combined(with: .opacity))
            }
        }
        .accessibilityStatus(viewModel.hasLiked ? "Mention J’aime ajoutée. Vous pouvez continuer." : "")
        .animation(.spring(duration: 0.5, bounce: 0.55), value: viewModel.hasLiked)
        .task {
            guard !reduceMotion else { return }
            try? await Task.sleep(for: .seconds(1.2))
            hint = true
        }
    }

    private var post: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                AppLogo(size: 32)
                    .padding(4)
                    .background(Color.cloneInk, in: .circle)
                Text(Mascot.name.lowercased())
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }
            .padding(12)
            photo
            HStack(spacing: 16) {
                LikeButton(isLiked: viewModel.hasLiked) { viewModel.likePost(method: .button) }
                Image(systemName: "bubble.right").accessibilityHidden(true)
                Image(systemName: "paperplane").accessibilityHidden(true)
                Spacer()
            }
            .font(.title3)
            .padding(12)
        }
        .background(Color.onboardingSurface, in: .rect(cornerRadius: 24))
        .clipShape(.rect(cornerRadius: 24))
    }

    private var photo: some View {
        let interest = viewModel.featuredInterest
        return ZStack {
            LinearGradient(
                colors: [Color.cloneLime.opacity(0.9), Color(red: 0.1, green: 0.45, blue: 0.35)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: interest.symbol)
                .font(.system(size: 110, weight: .bold))
                .foregroundStyle(.white.opacity(0.9))
                .shadow(radius: 12)
            if !viewModel.hasLiked {
                Image(systemName: "hand.tap.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white)
                    .scaleEffect(hint ? 1.15 : 0.9)
                    .opacity(hint ? 1 : 0)
                    .offset(y: 90)
                    .animation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true), value: hint)
                    .accessibilityHidden(true)
            }
            DoubleTapHeart(trigger: doubleTaps)
        }
        .aspectRatio(1, contentMode: .fit)
        .contentShape(.rect)
        .onTapGesture(count: 2) {
            doubleTaps += 1
            viewModel.likePost(method: .doubleTap)
        }
        .accessibilityElement()
        .accessibilityLabel("Post de \(Mascot.name) : \(interest.title)")
        .accessibilityAction(named: "J'aime") { viewModel.likePost(method: .doubleTap) }
    }
}
