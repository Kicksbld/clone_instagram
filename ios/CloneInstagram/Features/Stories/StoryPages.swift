import Foundation

struct StoryViewer: Equatable, Identifiable {
    let account: PostAuthor
    let fullName: String
    let viewedAt: Date

    var id: String {
        account.id
    }
}

struct StoryViewerPage: Equatable {
    let items: [StoryViewer]
    let nextCursor: String?
}

struct ArchivedStoryPage: Equatable {
    let items: [Story]
    let nextCursor: String?
}
