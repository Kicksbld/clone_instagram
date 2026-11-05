import Foundation
import Observation

/**
 Menu « … » > « Modifier » d'un de mes posts ou reels (`PATCH /v1/posts/{id}`) : seule la légende change ; les
 mentions sont recalculées par l'API. L'enregistrement attend la réponse (ADR-020 : texte validé par le
 serveur) ; la nouvelle légende s'affiche ensuite partout (`PostEditStore`). Un échec garde la saisie, avec un
 message, pour réessayer.
 */
@Observable
final class EditPostViewModel {
    /// Légende saisie.
    var caption: String
    private(set) var isSaving = false
    /// Échec de l'enregistrement, affiché en alerte ; `nil` une fois fermée.
    var errorMessage: String?

    private let postId: String
    private let original: String
    private let service: any PostService
    private let edits: PostEditStore

    /// 2 200 caractères au plus, comptés en points de code comme l'API (`maxLength` du contrat).
    private static let maxLength = 2200
    private static let tooManyMentions =
        "Vous pouvez mentionner au maximum 20 comptes. Modifiez votre légende et réessayez."

    init(route: EditPostRoute, service: any PostService, edits: PostEditStore) {
        postId = route.postId
        original = route.caption
        caption = route.caption
        self.service = service
        self.edits = edits
    }

    /// La légende diffère de celle d'origine (espaces de début et de fin ignorés, comme l'API).
    var hasChanges: Bool {
        trimmed != original.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmed: String {
        caption.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Enregistre la légende ; `true` si l'API l'a acceptée (l'écran peut se fermer).
    func save() async -> Bool {
        guard !isSaving else { return false }
        guard trimmed.unicodeScalars.count <= Self.maxLength else {
            errorMessage = "La légende ne peut pas dépasser 2 200 caractères."
            return false
        }
        guard MentionParser.usernames(in: trimmed).count <= 20 else {
            errorMessage = Self.tooManyMentions
            return false
        }
        isSaving = true
        defer { isSaving = false }
        do {
            let post = try await service.updateCaption(postId: postId, caption: trimmed)
            edits.record(post)
            errorMessage = nil
            return true
        } catch {
            errorMessage = switch error {
            case .postNotFound: "Cette publication n'est plus disponible."
            case .tooManyMentions: Self.tooManyMentions
            case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
            default: "La légende n'a pas pu être modifiée. Réessayez."
            }
            return false
        }
    }
}
