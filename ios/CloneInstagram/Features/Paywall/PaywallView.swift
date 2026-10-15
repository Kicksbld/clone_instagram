import StoreKit
import SwiftUI

/// Paywall Clone Plus (wireframe, ADR-012) : avantages, prix localisé, « S'abonner », « Plus tard »,
/// « Restaurer les achats » et « Gérer l'abonnement » (exigences App Store).
struct PaywallView: View {
    @State private var viewModel: PaywallViewModel
    /// « Plus tard » (fin de l'onboarding), puis « Continuer » une fois abonné ; absent dans les Paramètres.
    private let onClose: (() -> Void)?

    @State private var isManagingSubscription = false

    init(viewModel: PaywallViewModel, onClose: (() -> Void)?) {
        _viewModel = State(initialValue: viewModel)
        self.onClose = onClose
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
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
        .task { await viewModel.load() }
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
        VStack(spacing: 8) {
            Image(systemName: viewModel.variant.symbol)
                .font(.largeTitle)
                .accessibilityHidden(true)
            Text(viewModel.variant.title)
                .font(.title.bold())
                .multilineTextAlignment(.center)
            Text(viewModel.variant.subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 16) {
            benefit("app.badge", "Icône d'app personnalisée", "Choisissez l'icône de Clone sur votre écran d'accueil.")
            benefit("clock", "Stories pendant 48 heures", "Bientôt disponible.")
            benefit("eye.slash", "Voir les stories en toute discrétion", "Bientôt disponible.")
            benefit("magnifyingglass", "Recherche dans les vues de vos stories", "Bientôt disponible.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func benefit(_ symbol: String, _ title: String, _ detail: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: symbol)
        }
    }

    @ViewBuilder
    private var offer: some View {
        switch viewModel.offer {
        case .loading:
            ProgressView()
        case let .loaded(offer):
            Text(
                "\(offer.price) par \(offer.period). Renouvellement automatique, "
                    + "annulable à tout moment dans les réglages de l'App Store."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        case .unavailable:
            VStack(spacing: 8) {
                Text("L'abonnement n'est pas disponible pour le moment.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        }
    }

    private var subscribed: some View {
        VStack(spacing: 4) {
            Text("Vous êtes abonné à Clone Plus.")
                .font(.subheadline.weight(.semibold))
            if let expiresAt = viewModel.planStatus.expiresAt {
                Text("Prochaine échéance : \(expiresAt.formatted(date: .long, time: .omitted))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var secondaryActions: some View {
        VStack(spacing: 8) {
            Button("Restaurer les achats") { Task { await viewModel.restore() } }
            Button("Gérer l'abonnement") { isManagingSubscription = true }
        }
        .font(.footnote)
        .disabled(viewModel.isWorking)
    }

    private var bottomActions: some View {
        VStack(spacing: 8) {
            if !viewModel.isSubscribed, case let .loaded(offer) = viewModel.offer {
                Button {
                    Task { await viewModel.subscribe() }
                } label: {
                    Group {
                        if viewModel.isWorking {
                            ProgressView()
                        } else {
                            Text(viewModel.variant.subscribeTitle(price: offer.price, period: offer.period))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(viewModel.isWorking)
            }
            if let onClose {
                Button(viewModel.isSubscribed ? "Continuer" : "Plus tard", action: onClose)
                    .controlSize(.large)
                    .disabled(viewModel.isWorking)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
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
