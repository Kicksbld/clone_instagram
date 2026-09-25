/// Ouverture des listes d'abonnés et d'abonnements d'un compte, sur l'onglet `kind`.
/// La destination est fournie par le routeur racine, comme `ProfileRoute`.
struct FollowListRoute: Hashable {
    let userId: String
    let username: String
    let followerCount: Int
    let followingCount: Int
    let kind: FollowListKind
}
