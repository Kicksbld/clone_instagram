/// Ouverture du profil d'un autre utilisateur dans la `NavigationStack` d'un onglet (ADR-010).
/// La destination est fournie par le routeur racine : une feature n'en importe pas une autre.
struct ProfileRoute: Hashable {
    let username: String
}
