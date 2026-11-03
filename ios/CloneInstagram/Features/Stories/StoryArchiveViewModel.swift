import Observation

@Observable
final class StoryArchiveViewModel {
    private(set) var items: [Story] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private var nextCursor: String?
    private let service: any StoryService

    init(service: any StoryService) {
        self.service = service
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    func load() async {
        guard !isLoading else { return }
        await fetch(cursor: nil)
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoading else { return }
        await fetch(cursor: cursor)
    }

    private func fetch(cursor: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await service.archive(cursor: cursor)
            if cursor == nil {
                items = page.items
            } else {
                let existing = Set(items.map(\.id))
                items += page.items.filter { !existing.contains($0.id) }
            }
            nextCursor = page.nextCursor
        } catch {
            errorMessage = "Impossible de charger l’archive. Vérifiez votre connexion et réessayez."
        }
    }
}
