import Foundation
import Observation

/// Modifier le profil (T3) : photo (nouvelle ou supprimée, appliquée tout de suite), nom, username et bio.
@Observable
final class EditProfileViewModel {
    static let fullNameMaxLength = 30
    static let bioMaxLength = 150

    private(set) var profile: Profile
    var fullName: String
    var username: String
    var bio: String

    private(set) var isSaving = false
    private(set) var isUpdatingPhoto = false
    private(set) var errorMessage: String?
    /// Enregistrement terminé : la vue se ferme.
    private(set) var didFinish = false

    private let identity: any IdentityService
    private let uploads: any UploadService
    private let onUpdated: (Profile) -> Void

    init(profile: Profile, identity: any IdentityService, uploads: any UploadService, onUpdated: @escaping (Profile) -> Void) {
        self.profile = profile
        fullName = profile.fullName
        username = profile.username
        bio = profile.bio
        self.identity = identity
        self.uploads = uploads
        self.onUpdated = onUpdated
    }

    var isBusy: Bool {
        isSaving || isUpdatingPhoto
    }

    // MARK: - Photo

    func changePhoto(_ data: Data) async {
        await updatePhoto {
            let mediaId = try await self.uploads.uploadImage(data, purpose: .avatar)
            return try await self.identity.updateMe(ProfileChanges(avatarMediaId: mediaId))
        }
    }

    func removePhoto() async {
        guard profile.avatar != nil else { return }
        await updatePhoto { try await self.identity.removeAvatar() }
    }

    func photoLoadFailed() {
        errorMessage = UploadError.message(for: .unreadableImage)
    }

    // MARK: - Nom, username, bio

    /// Envoie uniquement les champs modifiés ; sans modification, ferme directement.
    func save() async {
        guard !isBusy else { return }
        let fullName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let username = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let bio = bio.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !fullName.isEmpty, fullName.count <= Self.fullNameMaxLength else {
            errorMessage = "Saisissez un nom de 1 à \(Self.fullNameMaxLength) caractères."
            return
        }
        // Même règle que l'API (ADR-007).
        guard username.wholeMatch(of: /[a-z0-9._]{1,30}/) != nil else {
            errorMessage = "Le nom d'utilisateur contient 1 à 30 lettres minuscules, chiffres, points ou tirets bas."
            return
        }
        guard bio.count <= Self.bioMaxLength else {
            errorMessage = "La bio contient \(Self.bioMaxLength) caractères au plus."
            return
        }

        let changes = ProfileChanges(
            username: username == profile.username ? nil : username,
            fullName: fullName == profile.fullName ? nil : fullName,
            bio: bio == profile.bio ? nil : bio
        )
        guard changes != ProfileChanges() else {
            didFinish = true
            return
        }

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let updated = try await identity.updateMe(changes)
            apply(updated)
            didFinish = true
        } catch .usernameTaken {
            errorMessage = "Ce nom d'utilisateur est déjà pris."
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    // MARK: - Interne

    private func updatePhoto(_ operation: @escaping () async throws -> Profile) async {
        guard !isBusy else { return }
        isUpdatingPhoto = true
        errorMessage = nil
        defer { isUpdatingPhoto = false }
        do {
            let updated = try await operation()
            // Photo seulement : les champs en cours de saisie ne sont pas écrasés.
            profile.avatar = updated.avatar
            onUpdated(profile)
        } catch let error as UploadError {
            errorMessage = UploadError.message(for: error)
        } catch let error as IdentityServiceError {
            errorMessage = Self.message(for: error)
        } catch {
            errorMessage = "Une erreur est survenue. Réessayez."
        }
    }

    private func apply(_ updated: Profile) {
        profile = updated
        fullName = updated.fullName
        username = updated.username
        bio = updated.bio
        onUpdated(updated)
    }

    static func message(for error: IdentityServiceError) -> String {
        switch error {
        case .usernameTaken: "Ce nom d'utilisateur est déjà pris."
        case .mediaRejected: "Cette photo n'a pas pu être utilisée. Choisissez-en une autre."
        case .invalidInput: "Vérifiez les informations saisies."
        case .unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
        case .unauthenticated: "Votre session a expiré. Reconnectez-vous."
        case .profileNotFound, .userNotFound, .profileAlreadyExists, .ageRequirementNotMet, .unexpectedResponse:
            "Une erreur est survenue. Réessayez."
        }
    }
}
