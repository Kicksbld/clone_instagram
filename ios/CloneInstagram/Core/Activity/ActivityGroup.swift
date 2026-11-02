import Foundation

/// Groupe de notifications de l'Activité (ADR-026) : « lea et 1 autre ont aimé votre publication ».
struct ActivityGroup: Equatable, Identifiable {
    /// Types connus de l'app ; un type inconnu (tranche suivante) est ignoré à la lecture (ADR-019).
    enum Kind: Equatable {
        /// J'aime d'un de mes posts.
        case like
        /// Commentaire d'un de mes posts.
        case comment
        /// Réponse à un de mes commentaires.
        case commentReply
        /// Nouvel abonné.
        case follow
    }

    struct PostPreview: Equatable {
        let id: String
        let thumbnail: ImageVariants
    }

    struct CommentPreview: Equatable {
        let id: String
        let body: String
    }

    /// Identifiant stable du groupe.
    let id: String
    let kind: Kind
    /// Compte de la notification la plus récente du groupe.
    let actor: PostAuthor
    /// Nombre de comptes du groupe, `actor` compris.
    let actorCount: Int
    /// Date de la notification la plus récente.
    let createdAt: Date
    let isRead: Bool
    /// Post visé (J'aime, commentaire, réponse).
    let post: PostPreview?
    /// Commentaire ou réponse qui a créé la notification.
    let comment: CommentPreview?
}

/// Une page de l'Activité et le nombre de groupes non lus (pastille du cœur).
struct ActivityPage: Equatable {
    let items: [ActivityGroup]
    let nextCursor: String?
    let unreadCount: Int
}
