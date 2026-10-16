import Foundation

/// Assemblage des dépendances de l'app (ADR-010) : services injectés par protocole.
struct AppDependencies {
    let auth: any AuthService
    let identity: any IdentityService
    let uploads: any UploadService
    let social: any SocialService
    /// Comptes bloqués pendant la session, partagés par tous les écrans.
    let blocks: BlockStore
    let reports: any ReportService
    let posts: any PostService
    /// Likes partagés par le feed et le détail des posts.
    let likes: LikeSynchronizer
    let comments: any CommentService
    /// Nombre de commentaires des posts, partagé par le feed, le détail et la feuille de commentaires.
    let commentCounts: CommentCountStore
    /// Publications en cours, persistées (ADR-008).
    let publishQueue: PublishQueue
    /// Préchargement des photos du feed (Nuke).
    let imagePrefetcher: any ImagePrefetching
    /// Achat Clone Plus (RevenueCat) et plan vérifié par l'API (ADR-012).
    let purchases: any PurchaseService
    let subscriptions: any SubscriptionService
    let appIcons: any AppIconService
    /// Événements et variante du paywall (PostHog, ADR-013).
    let analytics: any AnalyticsService
    /// Refus `403 account_suspended` reçus pendant la session (ADR-005).
    let suspension: AccountSuspensionMonitor

    static func live(bundle: Bundle = .main) -> AppDependencies {
        let auth = makeAuth(bundle: bundle)
        let purchases = makePurchases(bundle: bundle)
        let analytics = makeAnalytics(bundle: bundle)
        guard let configuration = try? APIConfiguration(bundle: bundle) else {
            return unavailable(auth: auth, purchases: purchases, analytics: analytics)
        }
        let suspension = AccountSuspensionMonitor()
        let client = APIClientFactory.makeClient(
            configuration: configuration,
            accessToken: { await auth.accessToken() },
            onAccountSuspended: { await suspension.report() }
        )
        let uploads = UploadManager(media: APIMediaService(client: client), uploader: BackgroundFileUploader.shared)
        let posts = APIPostService(client: client)
        let social = APISocialService(client: client)
        return AppDependencies(
            auth: auth,
            identity: APIIdentityService(client: client),
            uploads: uploads,
            social: social,
            blocks: BlockStore(service: social),
            reports: APIReportService(client: client),
            posts: posts,
            likes: LikeSynchronizer(service: APIEngagementService(client: client), analytics: analytics),
            comments: APICommentService(client: client),
            commentCounts: CommentCountStore(),
            publishQueue: PublishQueue(
                store: FilePendingPostStore.applicationSupport,
                uploads: uploads,
                posts: posts,
                analytics: analytics
            ),
            imagePrefetcher: NukeImagePrefetcher(),
            purchases: purchases,
            subscriptions: APISubscriptionService(client: client),
            appIcons: SystemAppIconService(),
            analytics: analytics,
            suspension: suspension
        )
    }
}

extension AppDependencies {
    /// URL de l'API absente ou invalide : services « indisponibles », l'app affiche une erreur au lieu de planter.
    private static func unavailable(
        auth: any AuthService,
        purchases: any PurchaseService,
        analytics: any AnalyticsService
    ) -> AppDependencies {
        let posts = UnavailablePostService()
        return AppDependencies(
            auth: auth,
            identity: UnavailableIdentityService(),
            uploads: UnavailableUploadService(),
            social: UnavailableSocialService(),
            blocks: BlockStore(service: UnavailableSocialService()),
            reports: UnavailableReportService(),
            posts: posts,
            likes: LikeSynchronizer(service: UnavailableEngagementService(), analytics: analytics),
            comments: UnavailableCommentService(),
            commentCounts: CommentCountStore(),
            publishQueue: PublishQueue(
                store: FilePendingPostStore.applicationSupport,
                uploads: UnavailableUploadService(),
                posts: posts,
                analytics: analytics
            ),
            imagePrefetcher: NukeImagePrefetcher(),
            purchases: purchases,
            subscriptions: UnavailableSubscriptionService(),
            appIcons: SystemAppIconService(),
            analytics: analytics,
            suspension: AccountSuspensionMonitor()
        )
    }

    /// Clé ou URL absente : service « indisponible », l'app affiche une erreur au lieu de planter.
    private static func makeAuth(bundle: Bundle) -> any AuthService {
        if let configuration = try? SupabaseConfiguration(bundle: bundle) {
            SupabaseAuthService(configuration: configuration)
        } else {
            UnavailableAuthService()
        }
    }

    private static func makePurchases(bundle: Bundle) -> any PurchaseService {
        if let configuration = try? RevenueCatConfiguration(bundle: bundle) {
            RevenueCatPurchaseService(configuration: configuration)
        } else {
            UnavailablePurchaseService()
        }
    }

    /// Sans clé PostHog : aucun envoi, paywall `control` (ADR-013).
    private static func makeAnalytics(bundle: Bundle) -> any AnalyticsService {
        if let configuration = try? PostHogConfiguration(bundle: bundle) {
            PostHogAnalyticsService(configuration: configuration)
        } else {
            NoopAnalyticsService()
        }
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide.
struct UnavailableUploadService: UploadService, MediaUploading {
    func uploadImage(_: Data, purpose _: MediaPurpose) async throws(UploadError) -> String {
        throw .unreachable
    }

    func send(_: PreparedImage, purpose _: MediaPurpose) async throws(UploadError) -> String {
        throw .unreachable
    }

    func waitUntilProcessed(mediaId _: String) async throws(UploadError) {
        throw .unreachable
    }
}

/// Utilisé quand l'URL de l'API est absente ou invalide : l'app affiche une erreur au lieu de planter.
struct UnavailableIdentityService: IdentityService {
    func fetchMe() async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func checkUsername(_: String) async throws(IdentityServiceError) -> UsernameAvailability {
        throw .unreachable
    }

    func completeOnboarding(username _: String, fullName _: String, birthDate _: BirthDate) async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func updateMe(_: ProfileChanges) async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func removeAvatar() async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func updateSettings(isPrivate _: Bool) async throws(IdentityServiceError) -> Profile {
        throw .unreachable
    }

    func fetchUserProfile(username _: String) async throws(IdentityServiceError) -> UserProfile {
        throw .unreachable
    }

    func deleteMe() async throws(IdentityServiceError) {
        throw .unreachable
    }
}
