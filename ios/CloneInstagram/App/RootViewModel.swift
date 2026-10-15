import Foundation
import Observation

/// Routeur racine (ADR-010) : non connecté → bienvenue ; session sans profil → onboarding ; sinon accueil.
/// Fin de l'onboarding → paywall Clone Plus (ADR-012) → accueil.
@Observable
final class RootViewModel {
    enum Route: Equatable {
        /// Lancement : lecture de la session et de `GET /v1/me`.
        case loading
        case welcome
        case login
        case onboarding(OnboardingEntry)
        /// Paywall de fin d'onboarding (« Plus tard » mène à l'accueil).
        case paywall(Profile)
        case home(Profile)
        case failed(message: String)
    }

    private(set) var route: Route = .loading

    private let auth: any AuthService
    private let identity: any IdentityService
    private let purchases: any PurchaseService
    private let subscriptions: any SubscriptionService
    private let appIcons: any AppIconService
    private let analytics: any AnalyticsService

    init(
        auth: any AuthService,
        identity: any IdentityService,
        purchases: any PurchaseService = UnavailablePurchaseService(),
        subscriptions: any SubscriptionService = UnavailableSubscriptionService(),
        appIcons: any AppIconService = SystemAppIconService(),
        analytics: any AnalyticsService = NoopAnalyticsService()
    ) {
        self.auth = auth
        self.identity = identity
        self.purchases = purchases
        self.subscriptions = subscriptions
        self.appIcons = appIcons
        self.analytics = analytics
    }

    func start() async {
        route = .loading
        guard let provider = auth.currentProvider else {
            route = .welcome
            return
        }
        do {
            let profile = try await identity.fetchMe()
            route = .home(profile)
            // Reconnexion, nouvel appareil : événements rattachés au profil (ADR-013).
            analytics.identify(profileId: profile.id)
            // Au lancement (ADR-012) : client RevenueCat rattaché au profil, puis plan relu par l'API.
            await purchases.logIn(profileId: profile.id)
            await refreshPlan()
        } catch .profileNotFound {
            route = .onboarding(.resume(provider))
        } catch .unauthenticated {
            await auth.signOut()
            route = .welcome
        } catch {
            route = .failed(message: "Impossible de charger votre compte. Vérifiez votre connexion et réessayez.")
        }
    }

    func showSignUp() {
        route = .onboarding(.newAccount)
    }

    func showLogin() {
        route = .login
    }

    func showWelcome() {
        route = .welcome
    }

    /// Profil créé et onboarding terminé : paywall avant l'accueil.
    /// Le client RevenueCat est rattaché au profil pendant que le paywall s'affiche.
    func finishOnboarding(with profile: Profile) {
        route = .paywall(profile)
        // Déjà fait à la création du profil ; aussi ici pour un profil existant retrouvé pendant l'onboarding.
        analytics.identify(profileId: profile.id)
        let purchases = purchases
        Task { await purchases.logIn(profileId: profile.id) }
    }

    /// « Plus tard », ou abonnement confirmé : accueil.
    func closePaywall() {
        guard case let .paywall(profile) = route else { return }
        route = .home(profile)
    }

    /// Profil modifié depuis l'accueil (photo, nom, bio…).
    func updateProfile(_ profile: Profile) {
        guard case .home = route else { return }
        route = .home(profile)
    }

    /// Plan confirmé par l'API (paywall, Paramètres > Clone Plus).
    func updatePlan(_ planStatus: PlanStatus) {
        applyPlan(planStatus)
        Task { await resetIconIfNeeded(planStatus) }
    }

    /// Plan relu par l'API ; une erreur laisse le dernier plan connu (non bloquant).
    func refreshPlan() async {
        guard let planStatus = try? await subscriptions.refresh() else { return }
        applyPlan(planStatus)
        await resetIconIfNeeded(planStatus)
    }

    private func applyPlan(_ planStatus: PlanStatus) {
        switch route {
        case var .paywall(profile):
            profile.planStatus = planStatus
            route = .paywall(profile)
        case var .home(profile):
            profile.planStatus = planStatus
            route = .home(profile)
        default:
            break
        }
    }

    /// Abonnement terminé : l'icône personnalisée, avantage Plus, revient à l'icône principale.
    private func resetIconIfNeeded(_ planStatus: PlanStatus) async {
        guard planStatus.plan == .free, appIcons.current != .standard else { return }
        try? await appIcons.setIcon(.standard)
    }

    /// Tirer pour rafraîchir mon profil (compteurs, photo…) ; l'erreur laisse le profil affiché.
    func refreshProfile() async {
        guard case .home = route, let profile = try? await identity.fetchMe() else { return }
        updateProfile(profile)
    }

    func signOut() async {
        analytics.reset()
        await purchases.logOut()
        await auth.signOut()
        route = .welcome
    }
}
