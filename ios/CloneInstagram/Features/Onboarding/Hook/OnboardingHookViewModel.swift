import Foundation
import Observation

/**
 Hook de l'onboarding (ADR-038), avant l'inscription : quiz, like d'un faux post, première photo. Les données
 restent dans l'app ; chaque écran affiché, chaque réponse et chaque interaction partent en analytics.
 */
@Observable
final class OnboardingHookViewModel {
    private(set) var step: OnboardingHookStep = .intro
    /// Dernier déplacement : sens de la transition entre deux écrans.
    private(set) var isMovingForward = true
    /// Dans l'ordre du choix.
    private(set) var interests: [OnboardingInterest] = []
    private(set) var postingStyle: OnboardingPostingStyle?
    private(set) var rhythm: OnboardingRhythm?
    private(set) var hasLiked = false
    private(set) var photo: Data?
    /// Incrémenté à chaque nouvelle photo : la vue la décode une seule fois.
    private(set) var photoRevision = 0
    var photoFilter: OnboardingPhotoFilter = .original
    private(set) var isPhotoPublished = false

    private let analytics: any AnalyticsService
    private let feedback: any FeedbackService
    /// Fixé par `OnboardingViewModel`, qui reçoit le résultat.
    @ObservationIgnored var onFinished: (OnboardingHookResult) -> Void
    private var isFinished = false
    @ObservationIgnored private var photoMethod: OnboardingInteraction.Method = .library
    /// Questions déjà envoyées : un retour arrière puis une nouvelle avancée ne les renvoie pas.
    @ObservationIgnored private var answeredQuestions: Set<OnboardingQuizQuestion> = []

    init(
        analytics: any AnalyticsService = NoopAnalyticsService(),
        feedback: any FeedbackService = NoopFeedbackService(),
        onFinished: @escaping (OnboardingHookResult) -> Void
    ) {
        self.analytics = analytics
        self.feedback = feedback
        self.onFinished = onFinished
    }

    // MARK: - Navigation

    var progress: Double {
        step.screen.progress
    }

    /// « Passer » : proposé jusqu'à la célébration ; inutile sur le pont, qui mène déjà à l'inscription.
    var canSkip: Bool {
        step != .bridge
    }

    var canGoBack: Bool {
        step.previous != nil && step != .celebration
    }

    /// Bouton principal actif : une réponse choisie, le like fait.
    var canContinue: Bool {
        switch step {
        case .quizInterests: !interests.isEmpty
        case .quizStyle: postingStyle != nil
        case .quizRhythm: rhythm != nil
        case .likePost: hasLiked
        default: true
        }
    }

    /// Appelé par la vue à chaque écran affiché.
    func screenViewed() {
        analytics.track(.onboardingScreenViewed(step.screen))
    }

    func next() {
        guard canContinue, !isFinished else { return }
        trackAnswers(leaving: step)
        guard let next = step.next else {
            finish()
            return
        }
        isMovingForward = true
        step = next
    }

    func back() {
        guard canGoBack, let previous = step.previous else { return }
        isMovingForward = false
        step = previous
    }

    func skip() {
        guard canSkip, !isFinished else { return }
        analytics.track(.onboardingSkipped(step.screen))
        finish()
    }

    // MARK: - Son

    var isMuted: Bool {
        feedback.isMuted
    }

    func toggleMute() {
        feedback.isMuted.toggle()
        analytics.track(.onboardingSoundToggled(muted: feedback.isMuted))
    }

    // MARK: - Quiz

    func toggle(_ interest: OnboardingInterest) {
        if let index = interests.firstIndex(of: interest) {
            interests.remove(at: index)
        } else {
            interests.append(interest)
        }
    }

    func choose(_ style: OnboardingPostingStyle) {
        postingStyle = style
    }

    func choose(_ rhythm: OnboardingRhythm) {
        self.rhythm = rhythm
    }

    /// Centre d'intérêt mis en avant (faux post, paywall) : le premier choisi.
    var featuredInterest: OnboardingInterest {
        interests.first ?? .travel
    }

    // MARK: - Interactions

    func likePost(method: OnboardingInteraction.Method) {
        guard !hasLiked else { return }
        hasLiked = true
        feedback.play(.like)
        analytics.track(.onboardingInteractionCompleted(OnboardingInteraction(kind: .like, method: method)))
    }

    /// Photo prise ou choisie : prête à être filtrée puis publiée.
    func photoChosen(_ data: Data, method: OnboardingInteraction.Method) {
        photo = data
        photoRevision += 1
        photoMethod = method
        isPhotoPublished = false
        photoFilter = .original
        feedback.play(method == .camera ? .shutter : .pop)
    }

    /// La photo n'a pas pu être chargée depuis la photothèque.
    func photoLoadFailed() {
        feedback.play(.error)
    }

    func publishPhoto() {
        guard photo != nil, !isPhotoPublished else { return }
        isPhotoPublished = true
        feedback.play(.whoosh)
        analytics.track(.onboardingInteractionCompleted(OnboardingInteraction(kind: .photo, method: photoMethod)))
    }

    // MARK: - Interne

    /// Une réponse par valeur choisie, au premier passage à l'écran suivant.
    private func trackAnswers(leaving step: OnboardingHookStep) {
        let answers: [OnboardingQuizAnswer] = switch step {
        case .quizInterests: interests.map { .interest($0) }
        case .quizStyle: postingStyle.map { [.postingStyle($0)] } ?? []
        case .quizRhythm: rhythm.map { [.rhythm($0)] } ?? []
        default: []
        }
        guard let question = answers.first?.question, !answeredQuestions.contains(question) else { return }
        answeredQuestions.insert(question)
        for answer in answers {
            analytics.track(.onboardingQuizAnswered(answer))
        }
    }

    private func finish() {
        isFinished = true
        feedback.play(.whoosh)
        onFinished(OnboardingHookResult(interests: interests, photo: isPhotoPublished ? photo : nil))
    }
}
