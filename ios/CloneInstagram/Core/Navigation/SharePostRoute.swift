import SwiftUI

struct SharePostRoute: Identifiable {
    let postId: String
    var id: String {
        postId
    }
}

struct OpenSharePostAction {
    let open: (SharePostRoute) -> Void
    func callAsFunction(_ route: SharePostRoute) {
        open(route)
    }
}

extension EnvironmentValues {
    @Entry var openSharePost: OpenSharePostAction?
}
