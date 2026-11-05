import Foundation
import Testing
@testable import CloneInstagram

/// Hook de l'onboarding (ADR-038) : parcours, quiz, interactions et résultat transmis à l'inscription.
struct OnboardingHookViewModelTests {
    private let analytics = FakeAnalyticsService()
    private let feedback = FakeFeedbackService()
    private let results = HookResultRecorder()

    private func makeViewModel() -> OnboardingHookViewModel {
        OnboardingHookViewModel(analytics: analytics, feedback: feedback) { [results] in results.values.append($0) }
    }

    /// Avance jusqu'à `step` avec des réponses par défaut.
    private func advanced(to step: OnboardingHookStep) -> OnboardingHookViewModel {
        let viewModel = makeViewModel()
        while viewModel.step != step {
            switch viewModel.step {
            case .quizInterests: viewModel.toggle(.food)
            case .quizStyle: viewModel.choose(.photos)
            case .quizRhythm: viewModel.choose(.weekly)
            case .likePost: viewModel.likePost(method: .doubleTap)
            default: break
            }
            viewModel.next()
        }
        return viewModel
    }

    @Test func `quiz sans réponse : impossible d'avancer`() {
        let viewModel = advanced(to: .quizInterests)

        viewModel.next()
        #expect(viewModel.step == .quizInterests)

        viewModel.toggle(.travel)
        viewModel.next()
        #expect(viewModel.step == .insightInterests)
    }

    @Test func `centres d'intérêt dans l'ordre du choix ; un second appui retire`() {
        let viewModel = advanced(to: .quizInterests)

        viewModel.toggle(.music)
        viewModel.toggle(.sport)
        viewModel.toggle(.art)
        viewModel.toggle(.sport)

        #expect(viewModel.interests == [.music, .art])
        #expect(viewModel.featuredInterest == .music)
    }

    @Test func `insight : réplique du premier choix, mention de la variété à partir de 3`() {
        let viewModel = advanced(to: .quizInterests)
        viewModel.toggle(.animals)
        #expect(viewModel.interestsInsight == OnboardingInterest.animals.insight)

        viewModel.toggle(.food)
        viewModel.toggle(.fashion)
        #expect(viewModel.interestsInsight.hasPrefix(OnboardingInterest.animals.insight))
        #expect(viewModel.interestsInsight.contains("3 passions"))
    }

    @Test func `faux post : like obligatoire pour avancer, un seul like compté`() {
        let viewModel = advanced(to: .likePost)

        viewModel.next()
        #expect(viewModel.step == .likePost)

        viewModel.likePost(method: .doubleTap)
        viewModel.likePost(method: .button)
        #expect(feedback.cues.filter { $0 == .like }.count == 1)

        viewModel.next()
        #expect(viewModel.step == .firstPhoto)
    }

    @Test func `photo publiée : transmise à l'inscription avec les centres d'intérêt`() {
        let viewModel = advanced(to: .firstPhoto)
        let photo = Data([1, 2, 3])

        viewModel.photoChosen(photo, method: .camera)
        viewModel.publishPhoto()
        while results.values.isEmpty {
            viewModel.next()
        }

        #expect(results.values == [OnboardingHookResult(interests: [.food], photo: photo)])
        #expect(feedback.cues.contains(.shutter))
    }

    @Test func `photo choisie mais pas publiée : non transmise`() {
        let viewModel = advanced(to: .firstPhoto)

        viewModel.photoChosen(Data([1]), method: .library)
        viewModel.next()
        viewModel.next()
        viewModel.next()

        #expect(results.values == [OnboardingHookResult(interests: [.food], photo: nil)])
    }

    @Test func `célébration : réplique selon la photo publiée ou non`() {
        let withoutPhoto = advanced(to: .celebration)
        #expect(withoutPhoto.celebrationTitle == "Premier like envoyé !")

        let viewModel = advanced(to: .firstPhoto)
        viewModel.photoChosen(Data([1]), method: .library)
        viewModel.publishPhoto()
        viewModel.next()
        #expect(viewModel.celebrationTitle == "Ton premier post !")
    }

    @Test func `passer : inscription directe avec les réponses déjà données`() {
        let viewModel = advanced(to: .quizStyle)

        viewModel.skip()
        viewModel.skip()

        #expect(results.values == [OnboardingHookResult(interests: [.food], photo: nil)])
    }

    @Test func `retour arrière : écran précédent ; pas de retour depuis la célébration`() {
        let insight = advanced(to: .insightInterests)

        insight.back()
        #expect(insight.step == .quizInterests)
        #expect(insight.isMovingForward == false)

        let celebration = advanced(to: .celebration)
        celebration.back()
        #expect(celebration.step == .celebration)
    }

    @Test func `son coupé puis rétabli`() {
        let viewModel = makeViewModel()

        viewModel.toggleMute()
        #expect(viewModel.isMuted)
        viewModel.toggleMute()
        #expect(viewModel.isMuted == false)
    }
}

/// Analytics du hook (ADR-038) : écrans, réponses du quiz, interactions, « Passer » et son.
struct OnboardingHookAnalyticsTests {
    private let analytics = FakeAnalyticsService()

    private func makeViewModel() -> OnboardingHookViewModel {
        OnboardingHookViewModel(analytics: analytics, feedback: FakeFeedbackService()) { _ in }
    }

    @Test func `écran affiché : nom stable et position dans le parcours complet`() {
        let viewModel = makeViewModel()

        viewModel.screenViewed()

        #expect(analytics.events == [.onboardingScreenViewed(.intro)])
        #expect(AnalyticsEvent.onboardingScreenViewed(.intro).properties == ["screen": "intro", "index": "2"])
        #expect(OnboardingScreen.notificationPermission.index == OnboardingScreen.allCases.count)
    }

    @Test func `réponses envoyées une fois par valeur, au premier passage seulement`() {
        let viewModel = makeViewModel()
        viewModel.next()
        viewModel.next()
        viewModel.toggle(.travel)
        viewModel.toggle(.music)

        viewModel.next()
        viewModel.back()
        viewModel.next()

        let answers = analytics.events.compactMap { event -> OnboardingQuizAnswer? in
            if case let .onboardingQuizAnswered(answer) = event {
                answer
            } else {
                nil
            }
        }
        #expect(answers == [.interest(.travel), .interest(.music)])
        #expect(
            AnalyticsEvent.onboardingQuizAnswered(.interest(.travel)).properties
                == ["question": "interests", "answer": "travel"]
        )
    }

    @Test func `like et photo : interaction et méthode envoyées`() {
        let viewModel = makeViewModel()

        viewModel.likePost(method: .doubleTap)
        viewModel.photoChosen(Data([1]), method: .library)
        viewModel.publishPhoto()

        #expect(analytics.events == [
            .onboardingInteractionCompleted(OnboardingInteraction(kind: .like, method: .doubleTap)),
            .onboardingInteractionCompleted(OnboardingInteraction(kind: .photo, method: .library)),
        ])
    }

    @Test func `passer : écran quitté envoyé`() {
        let viewModel = makeViewModel()
        viewModel.next()

        viewModel.skip()

        #expect(analytics.events == [.onboardingSkipped(.promise)])
        #expect(AnalyticsEvent.onboardingSkipped(.promise).name == "onboarding_skipped")
    }

    @Test func `passer sur une question déjà répondue : réponse envoyée`() {
        let viewModel = makeViewModel()
        viewModel.next()
        viewModel.next()
        viewModel.toggle(.art)

        viewModel.skip()

        #expect(analytics.events == [.onboardingSkipped(.quizInterests), .onboardingQuizAnswered(.interest(.art))])
    }

    @Test func `son coupé : état envoyé`() {
        let viewModel = makeViewModel()

        viewModel.toggleMute()

        #expect(analytics.events == [.onboardingSoundToggled(muted: true)])
        #expect(AnalyticsEvent.onboardingSoundToggled(muted: true).properties == ["muted": "true"])
    }
}

final class HookResultRecorder {
    var values: [OnboardingHookResult] = []
}
