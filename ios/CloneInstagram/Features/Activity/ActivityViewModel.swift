import Foundation
import Observation

/// Activité (`GET /v1/activity`, ADR-026) : groupes du plus récent au plus ancien, par pages de 20, rangés
/// par période comme Instagram. L'ouverture marque tout comme lu (`POST /v1/activity/read`) et remet la
/// pastille du cœur à zéro.
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

    private let service: any ActivityService
    private let badge: ActivityBadge
    private let now: () -> Date
    private let calendar: Calendar

    init(
        service: any ActivityService,
        badge: ActivityBadge,
        now: @escaping () -> Date = Date.init,
        calendar: Calendar = .current
    ) {
        self.service = service
        self.badge = badge
        self.now = now
        self.calendar = calendar
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    var isEmpty: Bool {
        groups.isEmpty
    }

    /// Groupes rangés par période ; une période sans groupe n'est pas affichée.
    var sections: [Section] {
        let byPeriod = Dictionary(grouping: groups) { period(of: $0.createdAt) }
        return Period.allCases.compactMap { period in
            byPeriod[period].map { Section(period: period, groups: $0) }
        }
    }

    /// Affichage de l'écran : chargé la première fois seulement (retour depuis un post ou un profil).
    func appear() async {
        guard state != .loaded else { return }
        await load()
    }

    /// Première page, puis tout marquer comme lu ; un rafraîchissement garde la liste en cas d'échec.
    func load() async {
        if state != .loaded {
            state = .loading
        }
        do {
            let page = try await service.fetchActivity(cursor: nil)
            groups = page.items
            nextCursor = page.nextCursor
            loadMoreFailed = false
            state = .loaded
        } catch {
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

    /// Un groupe apparaît : page suivante à l'approche du bas.
    func groupAppeared(_ group: ActivityGroup) async {
        guard hasMore, let index = groups.firstIndex(where: { $0.id == group.id }), index >= groups.count - 4 else {
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
        case .commentReply:
            return "\(actor) a répondu à votre commentaire : \(group.comment?.body ?? "")"
        case .follow:
            return "\(actor) a commencé à vous suivre."
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
