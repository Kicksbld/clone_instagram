import Foundation
import Observation

/// Activité (`GET /v1/activity`, ADR-026) : groupes du plus récent au plus ancien, par pages de 20, rangés
/// par période comme Instagram. L'ouverture marque tout comme lu (`POST /v1/activity/read`) et remet la
/// pastille du cœur à zéro.
///
/// En tête, les demandes d'abonnement reçues (`GET /v1/me/follow-requests`), avec Accepter / Refuser optimistes
/// (ADR-020) : la demande disparaît tout de suite, et revient avec une alerte si l'API échoue.
@Observable
final class ActivityViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    /// Sections de l'Activité, comme Instagram.
    enum Period: CaseIterable {
        case today
        case thisWeek
        case thisMonth
        case older

        var title: String {
            switch self {
            case .today: "Aujourd'hui"
            case .thisWeek: "Cette semaine"
            case .thisMonth: "Ce mois-ci"
            case .older: "Plus ancien"
            }
        }
    }

    struct Section: Identifiable {
        let period: Period
        let groups: [ActivityGroup]

        var id: Period {
            period
        }
    }

    /// Réponse à une demande d'abonnement.
    enum FollowRequestDecision: Equatable {
        case accept
        case decline
    }

    /// Écran ouvert par un appui sur une notification.
    enum Destination: Hashable {
        case post(PostRoute)
        case profile(ProfileRoute)
    }

    private(set) var state: State = .loading
    private(set) var isLoadingMore = false
    /// Échec de la page suivante, affiché sous la liste.
    private(set) var loadMoreFailed = false
    private var groups: [ActivityGroup] = []
    private var nextCursor: String?

    /// Demandes d'abonnement reçues, la plus récente en premier.
    private var requests: [UserSummary] = []
    private var requestsCursor: String?
    /// Demandes acceptées ou refusées, masquées tout de suite ; réaffichées si l'API échoue.
    private var handledRequestIds: Set<String> = []
    private(set) var isLoadingMoreRequests = false
    /// Échec du chargement des demandes : la section propose de réessayer, l'Activité reste affichée.
    private(set) var requestsLoadFailed = false
    /// Échec d'une réponse à une demande, affiché en alerte ; `nil` une fois l'alerte fermée.
    var requestErrorMessage: String?

    @ObservationIgnored private let decisions = OptimisticSync<String, FollowRequestDecision?>()
    private let service: any ActivityService
    private let social: any SocialService
    private let badge: ActivityBadge
    private let now: () -> Date
    private let calendar: Calendar

    init(
        service: any ActivityService,
        social: any SocialService,
        badge: ActivityBadge,
        now: @escaping () -> Date = Date.init,
        calendar: Calendar = .current
    ) {
        self.service = service
        self.social = social
        self.badge = badge
        self.now = now
        self.calendar = calendar
    }

    /// Demandes en attente affichées dans la section en tête.
    var followRequests: [UserSummary] {
        requests.filter { !handledRequestIds.contains($0.id) }
    }

    var hasMoreRequests: Bool {
        requestsCursor != nil
    }

    /// Titre de la section : « Demandes d'abonnement (3) », « (20+) » s'il en reste à charger.
    var followRequestsTitle: String {
        "Demandes d'abonnement (\(followRequests.count)\(hasMoreRequests ? "+" : ""))"
    }

    /// La section est affichée s'il y a des demandes, ou si leur chargement a échoué.
    var showsFollowRequests: Bool {
        !followRequests.isEmpty || requestsLoadFailed
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    var isEmpty: Bool {
        rows.isEmpty && !showsFollowRequests
    }

    /// Groupes affichés en ligne : une demande d'abonnement est dans la section des demandes.
    private var rows: [ActivityGroup] {
        groups.filter { $0.kind != .followRequest }
    }

    /// Groupes rangés par période ; une période sans groupe n'est pas affichée.
    var sections: [Section] {
        let byPeriod = Dictionary(grouping: rows) { period(of: $0.createdAt) }
        return Period.allCases.compactMap { period in
            byPeriod[period].map { Section(period: period, groups: $0) }
        }
    }

    /// Affichage de l'écran : chargé la première fois seulement (retour depuis un post ou un profil).
    func appear() async {
        guard state != .loaded else { return }
        await load()
    }

    /// Première page et demandes reçues, puis tout marquer comme lu ; un rafraîchissement garde la liste en cas
    /// d'échec.
    func load() async {
        if state != .loaded {
            state = .loading
        }
        async let requestsLoad: Void = loadRequests()
        do {
            let page = try await service.fetchActivity(cursor: nil)
            await requestsLoad
            groups = page.items
            nextCursor = page.nextCursor
            loadMoreFailed = false
            state = .loaded
        } catch {
            await requestsLoad
            if state != .loaded {
                state = .failed(message: "Impossible de charger l'activité. Vérifiez votre connexion et réessayez.")
            }
            return
        }
        // Non bloquant : un échec laisse la pastille, relue au prochain retour au premier plan.
        if await (try? service.markAllRead()) != nil {
            badge.cleared()
        }
    }

    /// Page suivante.
    func loadMore() async {
        guard state == .loaded, let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await service.fetchActivity(cursor: cursor)
            let known = Set(groups.map(\.id))
            groups += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
            loadMoreFailed = false
        } catch {
            loadMoreFailed = true
        }
    }

    /// Première page des demandes reçues ; un échec garde les demandes déjà affichées.
    func loadRequests() async {
        do {
            let page = try await social.listFollowRequests(cursor: nil)
            requests = page.items
            requestsCursor = page.nextCursor
            handledRequestIds = handledRequestIds.filter { decisions.isSyncing($0) }
            requestsLoadFailed = false
        } catch {
            requestsLoadFailed = requests.isEmpty
        }
    }

    /// Demandes suivantes (« Voir plus »).
    func loadMoreRequests() async {
        guard let cursor = requestsCursor, !isLoadingMoreRequests else { return }
        isLoadingMoreRequests = true
        defer { isLoadingMoreRequests = false }
        do {
            let page = try await social.listFollowRequests(cursor: cursor)
            let known = Set(requests.map(\.id))
            requests += page.items.filter { !known.contains($0.id) }
            requestsCursor = page.nextCursor
        } catch {
            requestErrorMessage = "Impossible de charger la suite des demandes. Vérifiez votre connexion et réessayez."
        }
    }

    /// Accepter ou refuser la demande de `requester` : elle disparaît tout de suite (ADR-020).
    func respond(_ decision: FollowRequestDecision, to requester: UserSummary) async {
        guard !handledRequestIds.contains(requester.id) else { return }
        handledRequestIds.insert(requester.id)
        let outcome = await decisions.sync(
            requester.id,
            to: decision,
            confirmed: nil,
            intentOf: \.self
        ) { wanted throws(SocialServiceError) -> FollowRequestDecision? in
            switch wanted {
            case .accept?: try await social.acceptFollowRequest(from: requester.id)
            case .decline?: try await social.declineFollowRequest(from: requester.id)
            case nil: break
            }
            return wanted
        }
        switch outcome {
        case .pending:
            break
        case .confirmed, .failed(.followRequestNotFound, _, _):
            // Réponse enregistrée, ou demande annulée entre-temps (`404`) : elle ne revient pas.
            requests.removeAll { $0.id == requester.id }
            handledRequestIds.remove(requester.id)
        case let .failed(_, wanted, _):
            handledRequestIds.remove(requester.id)
            requestErrorMessage = wanted == .decline
                ? "Impossible de refuser cette demande. Vérifiez votre connexion et réessayez."
                : "Impossible d'accepter cette demande. Vérifiez votre connexion et réessayez."
        }
    }

    /// Un groupe apparaît : page suivante à l'approche du bas.
    func groupAppeared(_ group: ActivityGroup) async {
        guard hasMore, let index = rows.firstIndex(where: { $0.id == group.id }), index >= rows.count - 4 else {
            return
        }
        await loadMore()
    }

    /// Phrase de la notification, comme Instagram : « lea et 1 autre ont aimé votre publication. »
    static func message(for group: ActivityGroup) -> String {
        let actor = group.actor.username
        switch group.kind {
        case .like:
            let others = group.actorCount - 1
            return switch others {
            case ...0: "\(actor) a aimé votre publication."
            case 1: "\(actor) et 1 autre ont aimé votre publication."
            default: "\(actor) et \(others) autres ont aimé votre publication."
            }
        case .comment:
            return "\(actor) a commenté : \(group.comment?.body ?? "")"
        case .mention:
            return group.comment == nil ? "\(actor) vous a mentionné(e) dans une publication." : "\(actor) vous a mentionné(e) dans un commentaire."
        case .commentReply:
            return "\(actor) a répondu à votre commentaire : \(group.comment?.body ?? "")"
        case .follow:
            return "\(actor) a commencé à vous suivre."
        case .followRequest:
            return "\(actor) a demandé à vous suivre."
        case .followAccepted:
            return "\(actor) a accepté votre demande d'abonnement."
        }
    }

    /// Un appui ouvre le post visé, ou le profil du nouvel abonné.
    static func destination(for group: ActivityGroup) -> Destination {
        if let post = group.post {
            .post(PostRoute(postId: post.id))
        } else {
            .profile(ProfileRoute(username: group.actor.username))
        }
    }

    /// Aujourd'hui, 7 derniers jours, 30 derniers jours, puis plus ancien.
    private func period(of date: Date) -> Period {
        let now = now()
        if calendar.isDate(date, inSameDayAs: now) {
            return .today
        }
        let days = calendar.dateComponents([.day], from: date, to: now).day ?? .max
        if days < 7 {
            return .thisWeek
        }
        return days < 30 ? .thisMonth : .older
    }
}
