import Foundation
import Observation

/// État de tout l'onboarding (fiche T2) : une étape par écran, profil créé au « J'accepte » (ADR-018).
@Observable
final class OnboardingViewModel {
    /// Écran racine de la pile ; devient `profilePhoto` une fois le profil créé (pas de retour arrière).
    private(set) var rootStep: OnboardingStep
    var path: [OnboardingStep] = [] {
        didSet { errorMessage = nil }
    }

    var currentStep: OnboardingStep {
        path.last ?? rootStep
    }

    var email = ""
    var code = ""
    var password = ""
    var birthDate: Date
    var fullName = ""
    private(set) var username = ""
    private(set) var usernameStatus: UsernameStatus = .idle
    var bio = ""

    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var resendAvailableAt: Date?
    private(set) var profile: Profile?

    private let auth: any AuthService
    private let identity: any IdentityService
    private let now: () -> Date
    private let sleep: (Duration) async throws -> Void
    private let onFinished: (Profile) -> Void
    /// Vérification du username en cours ; lue par les tests pour attendre sa fin.
    @ObservationIgnored private(set) var usernameCheck: Task<Void, Never>?

    init(
        entry: OnboardingEntry,
        auth: any AuthService,
        identity: any IdentityService,
        now: @escaping () -> Date = Date.init,
        sleep: @escaping (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
        onFinished: @escaping (Profile) -> Void
    ) {
        rootStep = entry.firstStep
        self.auth = auth
        self.identity = identity
        self.now = now
        self.sleep = sleep
        self.onFinished = onFinished
        birthDate = now()
    }

    // MARK: - Compte (email, code, mot de passe, Apple)

    func startEmailSignUp() {
        path.append(.email)
    }

    var canResendCode: Bool {
        guard let resendAvailableAt else { return true }
        return now() >= resendAvailableAt
    }

    func submitEmail() async {
        email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.wholeMatch(of: /[^@\s]+@[^@\s]+\.[^@\s]+/) != nil else {
            errorMessage = "Saisissez une adresse e-mail valide."
            return
        }
        await perform {
            try await self.sendCode()
            self.path.append(.confirmationCode)
        }
    }

    func resendCode() async {
        guard canResendCode else { return }
        await perform { try await self.sendCode() }
    }

    func submitCode() async {
        code = code.filter(\.isNumber)
        guard code.count == 6 else {
            errorMessage = "Le code contient 6 chiffres."
            return
        }
        await perform {
            try await self.auth.verifySignupCode(self.code, email: self.email)
            try await self.continueAfterAuthentication(next: .password)
        }
    }

    func signInWithApple(_ credential: AppleCredential) async {
        await perform {
            try await self.auth.signInWithApple(credential)
            if let name = credential.fullName, self.fullName.isEmpty {
                self.fullName = String(name.prefix(Self.fullNameMaxLength))
            }
            try await self.continueAfterAuthentication(next: .birthDate)
        }
    }

    func appleSignInFailed() {
        errorMessage = "La connexion avec Apple a échoué. Réessayez."
    }

    func submitPassword() async {
        guard password.count >= Self.minimumPasswordLength else {
            errorMessage = "Le mot de passe doit contenir au moins \(Self.minimumPasswordLength) caractères."
            return
        }
        await perform {
            try await self.auth.setPassword(self.password)
            self.path.append(.birthDate)
        }
    }

    // MARK: - Profil (date de naissance, nom, username, conditions)

    func submitBirthDate() {
        let age = BirthDate(birthDate).age(on: BirthDate(now()))
        guard age >= Self.minimumAge else {
            errorMessage = "Vous devez avoir au moins \(Self.minimumAge) ans pour créer un compte."
            return
        }
        path.append(.fullName)
    }

    func submitFullName() async {
        fullName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !fullName.isEmpty, fullName.count <= Self.fullNameMaxLength else {
            errorMessage = "Saisissez un nom de 1 à \(Self.fullNameMaxLength) caractères."
            return
        }
        path.append(.username)
        await prepareUsernameSuggestion()
    }

    /// Premier passage sur l'étape username : candidat tiré du nom, remplacé par une suggestion libre s'il est pris.
    func prepareUsernameSuggestion() async {
        guard username.isEmpty else { return }
        let candidate = UsernameSuggestion.candidate(fullName: fullName, email: email)
        username = candidate
        await checkUsername(candidate)
        if case let .taken(suggestions) = usernameStatus, let first = suggestions.first {
            username = first
            usernameStatus = .available
        }
    }

    /// Saisie du username : vérification en direct après une courte pause de frappe.
    func usernameChanged(_ value: String) {
        let normalized = value.lowercased()
        username = normalized
        usernameCheck?.cancel()
        guard UsernameSuggestion.isValid(normalized) else {
            usernameStatus = normalized.isEmpty ? .idle : .invalid
            return
        }
        usernameStatus = .checking
        usernameCheck = Task { [weak self] in
            do {
                try await self?.sleep(Self.usernameCheckDelay)
            } catch {
                return
            }
            await self?.checkUsername(normalized)
        }
    }

    func chooseSuggestion(_ suggestion: String) {
        usernameCheck?.cancel()
        username = suggestion
        usernameStatus = .available
    }

    func submitUsername() {
        guard usernameStatus == .available else { return }
        path.append(.terms)
    }

    func acceptTerms() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let created = try await identity.completeOnboarding(
                username: username,
                fullName: fullName,
                birthDate: BirthDate(birthDate)
            )
            profile = created
            rootStep = .profilePhoto
            path = []
        } catch .usernameTaken {
            // Pris entre-temps : retour à l'étape username, avec de nouvelles suggestions.
            path.removeLast()
            await checkUsername(username)
            errorMessage = "Ce nom d'utilisateur vient d'être pris. Choisissez-en un autre."
        } catch .profileAlreadyExists {
            await finishWithExistingProfile()
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    // MARK: - Configuration du profil (photo, bio)

    func skipProfilePhoto() {
        path.append(.bio)
    }

    func submitBio() async {
        let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= Self.bioMaxLength else {
            errorMessage = "La bio contient \(Self.bioMaxLength) caractères au plus."
            return
        }
        guard !trimmed.isEmpty else {
            skipBio()
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            profile = try await identity.updateMe(ProfileChanges(bio: trimmed))
            path.append(.completed)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func skipBio() {
        path.append(.completed)
    }

    func finish() {
        guard let profile else { return }
        onFinished(profile)
    }

    // MARK: - Interne

    private func sendCode() async throws(AuthServiceError) {
        try await auth.sendSignupCode(to: email)
        resendAvailableAt = now().addingTimeInterval(Self.resendDelay)
    }

    /// Compte déjà complet (reconnexion par code ou par Apple) → accueil ; sinon étape suivante.
    private func continueAfterAuthentication(next: OnboardingStep) async throws(IdentityServiceError) {
        do {
            try await onFinished(identity.fetchMe())
        } catch .profileNotFound {
            path.append(next)
        }
    }

    private func finishWithExistingProfile() async {
        do {
            try await onFinished(identity.fetchMe())
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    private func checkUsername(_ candidate: String) async {
        usernameStatus = .checking
        let status: UsernameStatus
        do {
            let availability = try await identity.checkUsername(candidate)
            status = availability.available ? .available : .taken(suggestions: availability.suggestions)
        } catch .invalidInput {
            status = .invalid
        } catch {
            status = .failed
        }
        // Réponse périmée : l'utilisateur a modifié le champ entre-temps.
        guard username == candidate else { return }
        usernameStatus = status
    }

    /// Exécute une action réseau : un seul envoi à la fois, message d'erreur compréhensible.
    private func perform(_ action: () async throws -> Void) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await action()
        } catch let error as AuthServiceError {
            errorMessage = Self.message(for: error)
        } catch let error as IdentityServiceError {
            errorMessage = Self.message(for: error)
        } catch {
            errorMessage = "Une erreur est survenue. Réessayez."
        }
    }
}
