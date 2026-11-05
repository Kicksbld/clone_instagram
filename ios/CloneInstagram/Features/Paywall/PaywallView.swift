import StoreKit
import SwiftUI

/// Paywall Clone Plus (ADR-012), dans le style de l'onboarding (ADR-038) : mascotte Cœur, avantages animés,
/// déroulé de l'abonnement, prix localisé, « S'abonner », « Plus tard », « Restaurer les achats » et « Gérer
/// l'abonnement » (exigences App Store). La variante de l'A/B test (ADR-013) garde l'accroche et le bouton.
struct PaywallView: View {
    @State private var viewModel: PaywallViewModel
    /// « Plus tard » (fin de l'onboarding), puis « Continuer » une fois abonné ; absent dans les Paramètres.
    private let onClose: (() -> Void)?
    /// Premier centre d'intérêt du hook (fin d'onboarding) : accroche personnalisée.
    private let featuredInterest: OnboardingInterest?

    @State private var isManagingSubscription = false
    @State private var isShown = false
    @State private var confetti = 0
    @Environment(\.feedback) private var feedback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(viewModel: PaywallViewModel, onClose: (() -> Void)?, featuredInterest: OnboardingInterest? = nil) {
        _viewModel = State(initialValue: viewModel)
        self.onClose = onClose
        self.featuredInterest = featuredInterest
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header
                benefits
                if viewModel.isSubscribed {
                    subscribed
                } else {
                    offer
                }
                secondaryActions
            }
            .padding(24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) { bottomActions }
        .overlay { ConfettiView(trigger: confetti).ignoresSafeArea() }
        .onboardingScreen(forcesWindowScheme: onClose != nil)
        .task { await viewModel.load() }
        .onAppear {
            guard !isShown else { return }
            feedback.play(.pop)
            withAnimation(.spring(duration: 0.7, bounce: 0.4)) { isShown = true }
        }
        .onChange(of: viewModel.isSubscribed) { _, isSubscribed in
            guard isSubscribed else { return }
            AccessibilityFeedback.announce("Abonnement Clone Plus activé")
            feedback.play(.success)
            confetti += 1
        }
        .manageSubscriptionsSheet(isPresented: $isManagingSubscription)
        .alert(
            "Clone Plus",
            isPresented: Binding(get: { viewModel.message != nil }, set: {
                if !$0 {
                    viewModel.message = nil
                }
            }),
            presenting: viewModel.message
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { message in
            Text(message)
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            MascotView(pose: .heart, size: 180)
                .scaleEffect(isShown || reduceMotion ? 1 : 0.5)
            if let featuredInterest {
                Label("Pour vos posts \(featuredInterest.title.lowercased())", systemImage: featuredInterest.symbol)
                    .font(.onboardingBody(.footnote, weight: .bold))
                    .foregroundStyle(Color.onboardingBackground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.cloneLime, in: .capsule)
            }
            Label {
                Text(viewModel.variant.title)
            } icon: {
                Image(systemName: viewModel.variant.symbol)
                    .foregroundStyle(Color.cloneLime)
                    .accessibilityHidden(true)
            }
            .font(.onboardingTitle(.title))
            .multilineTextAlignment(.center)
            Text(viewModel.variant.subtitle)
                .font(.onboardingBody(.subheadline))
                .foregroundStyle(Color.onboardingSecondaryText)
                .multilineTextAlignment(.center)
        }
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(Self.benefits.enumerated()), id: \.offset) { index, item in
                benefit(item.symbol, item.title, item.detail)
                    .opacity(isShown || reduceMotion ? 1 : 0)
                    .offset(x: isShown || reduceMotion ? 0 : 40)
                    .animation(.spring(duration: 0.5, bounce: 0.3).delay(0.15 + Double(index) * 0.08), value: isShown)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.onboardingSurface, in: .rect(cornerRadius: 24))
    }

    private static let benefits: [(symbol: String, title: String, detail: String)] = [
        ("app.badge", "Icône d'app personnalisée", "Choisissez l'icône de Clone sur votre écran d'accueil."),
        ("clock", "Stories pendant 48 heures", "Bientôt disponible."),
        ("eye.slash", "Voir les stories en toute discrétion", "Bientôt disponible."),
        ("magnifyingglass", "Recherche dans les vues de vos stories", "Bientôt disponible."),
    ]

    private func benefit(_ symbol: String, _ title: String, _ detail: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.onboardingBody(.subheadline, weight: .semibold))
                Text(detail).font(.onboardingBody(.footnote)).foregroundStyle(Color.onboardingSecondaryText)
            }
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(Color.cloneLime)
        }
    }

    @ViewBuilder
    private var offer: some View {
        switch viewModel.offer {
        case .loading:
            ProgressView().accessibilityLabel("Chargement en cours")
        case let .loaded(offer):
            timeline(offer)
        case .unavailable:
            VStack(spacing: 8) {
                Text("L'abonnement n'est pas disponible pour le moment.")
                    .font(.footnote)
                    .foregroundStyle(Color.onboardingSecondaryText)
                Button("Réessayer") { Task { await viewModel.load() } }
                    .buttonStyle(.onboardingSecondary)
            }
        }
    }

    /// Déroulé de l'abonnement (sans période d'essai : l'offre n'en a pas).
    private func timeline(_ offer: PlusOffer) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            timelineStep("lock.open.fill", "Aujourd'hui", "Tous les avantages Clone Plus, tout de suite.", isLast: false)
            timelineStep(
                "arrow.triangle.2.circlepath",
                "Ensuite",
                "\(offer.price) par \(offer.period), renouvelé automatiquement.",
                isLast: false
            )
            timelineStep(
                "xmark.circle.fill",
                "Quand vous voulez",
                "Annulable à tout moment dans les réglages de l'App Store.",
                isLast: true
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func timelineStep(_ symbol: String, _ title: String, _ detail: String, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 0) {
                Image(systemName: symbol)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.onboardingBackground)
                    .frame(width: 36, height: 36)
                    .background(Color.cloneLime, in: .circle)
                if !isLast {
                    Rectangle()
                        .fill(Color.cloneLime.opacity(0.35))
                        .frame(width: 4, height: 28)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.onboardingBody(.headline, weight: .bold))
                Text(detail).font(.onboardingBody(.subheadline)).foregroundStyle(Color.onboardingSecondaryText)
            }
            .padding(.top, 6)
        }
        .accessibilityElement(children: .combine)
    }

    private var subscribed: some View {
        VStack(spacing: 4) {
            Text("Vous êtes abonné à Clone Plus.")
                .font(.onboardingBody(.subheadline, weight: .semibold))
            if let expiresAt = viewModel.planStatus.expiresAt {
                Text("Prochaine échéance : \(expiresAt.formatted(date: .long, time: .omitted))")
                    .font(.footnote)
                    .foregroundStyle(Color.onboardingSecondaryText)
            }
        }
    }

    private var secondaryActions: some View {
        VStack(spacing: 0) {
            Button("Restaurer les achats") { Task { await viewModel.restore() } }
            Button("Gérer l'abonnement") { isManagingSubscription = true }
        }
        .buttonStyle(.onboardingSecondary)
        .disabled(viewModel.isWorking)
    }

    private var bottomActions: some View {
        VStack(spacing: 4) {
            if !viewModel.isSubscribed, case let .loaded(offer) = viewModel.offer {
                Button {
                    Task { await viewModel.subscribe() }
                } label: {
                    Group {
                        if viewModel.isWorking {
                            ProgressView().accessibilityLabel("Chargement en cours").tint(Color.onboardingBackground)
                        } else {
                            Text(viewModel.variant.subscribeTitle(price: offer.price, period: offer.period))
                        }
                    }
                }
                .buttonStyle(.onboardingPrimary)
                .disabled(viewModel.isWorking)
            }
            if let onClose {
                if viewModel.isSubscribed {
                    Button("Continuer", action: onClose)
                        .buttonStyle(.onboardingPrimary)
                } else {
                    Button("Plus tard", action: onClose)
                        .buttonStyle(.onboardingSecondary)
                        .disabled(viewModel.isWorking)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .background(Color.onboardingBackground.opacity(0.9).ignoresSafeArea())
    }
}

/// Textes de chaque variante de l'A/B test (ADR-013) : `test` met l'icône d'app personnalisée en avant.
private extension PaywallVariant {
    var symbol: String {
        switch self {
        case .control: "plus.circle"
        case .test: "app.badge"
        }
    }

    var title: String {
        switch self {
        case .control: "Clone Plus"
        case .test: "Exprimez votre style"
        }
    }

    var subtitle: String {
        switch self {
        case .control: "Plus de façons de vous exprimer et de partager avec votre communauté."
        case .test: "Avec Clone Plus, choisissez l'icône de Clone sur votre écran d'accueil, et bientôt plus encore."
        }
    }

    func subscribeTitle(price: String, period: String) -> String {
        switch self {
        case .control: "S'abonner pour \(price)/\(period)"
        case .test: "Essayer Clone Plus"
        }
    }
}
