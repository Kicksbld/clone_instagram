import Foundation
import Observation

@Observable
final class StoryViewersViewModel {
    private(set) var items: [StoryViewer] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    var needsPlus = false
    private var nextCursor: String?
    private var query: String?
    private var generation = 0
    private let storyId: String
    private let service: any StoryService

    init(storyId: String, service: any StoryService) {
        self.storyId = storyId
        self.service = service
    }

    var hasMore: Bool {
        nextCursor != nil
    }

    func load(query: String? = nil) async {
        generation += 1
        let request = generation
        self.query = query
        nextCursor = nil
        isLoading = true
        errorMessage = nil
        defer {
            if generation == request {
                isLoading = false
            }
        }
        do {
            let page = try await service.viewers(storyId: storyId, cursor: nil, query: query)
            guard generation == request else { return }
            items = page.items
            nextCursor = page.nextCursor
        } catch {
            guard generation == request else { return }
            handle(error)
        }
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoading else { return }
        let request = generation
        isLoading = true
        errorMessage = nil
        defer {
            if generation == request {
                isLoading = false
            }
        }
        do {
            let page = try await service.viewers(storyId: storyId, cursor: cursor, query: query)
            guard generation == request else { return }
            let existing = Set(items.map(\.id))
            items += page.items.filter { !existing.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            guard generation == request else { return }
            handle(error)
        }
    }

    private func handle(_ error: StoryServiceError) {
        if error == .plusRequired {
            needsPlus = true
        } else {
            errorMessage = "Impossible de charger les vues. Réessayez."
        }
    }
}
