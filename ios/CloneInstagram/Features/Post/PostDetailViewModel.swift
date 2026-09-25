import Foundation
import Observation

/// Détail d'un post (`GET /v1/posts/{id}`) ; invisible ou supprimé → « Cette publication n'est pas disponible ».
@Observable
final class PostDetailViewModel {
    enum State: Equatable {
        case loading
        case loaded(Post)
        case notFound
        case failed(message: String)
    }

    private(set) var state: State = .loading

    private let postId: String
    private let posts: any PostService

    init(postId: String, posts: any PostService) {
        self.postId = postId
        self.posts = posts
    }

    func load() async {
        if case .loaded = state {} else {
            state = .loading
        }
        do {
            state = try await .loaded(posts.fetchPost(id: postId))
        } catch .postNotFound {
            state = .notFound
        } catch {
            if case .loaded = state {
                return
            }
            state = .failed(message: "Impossible de charger la publication. Vérifiez votre connexion et réessayez.")
        }
    }
}
