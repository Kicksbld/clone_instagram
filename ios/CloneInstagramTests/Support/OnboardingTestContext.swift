import Foundation
import Testing
@testable import CloneInstagram

/// Contexte commun des tests de l'onboarding : faux services, horloge fixe, profils transmis à l'accueil.
struct OnboardingTestContext {
    let auth = FakeAuthService()
    let identity = FakeIdentityService()
    let uploads = FakeUploadService()
    let clock = TestClock(now: Date(timeIntervalSince1970: 1_790_337_600)) // 2026-09-25 12:00 UTC
    let finished = FinishedRecorder()

    func makeViewModel(entry: OnboardingEntry = .newAccount) -> OnboardingViewModel {
        OnboardingViewModel(
            entry: entry,
            auth: auth,
            identity: identity,
            uploads: uploads,
            now: { [clock] in clock.now },
            sleep: { _ in },
            onFinished: { [finished] in finished.profiles.append($0) }
        )
    }

    func date(_ year: Int, _ month: Int, _ day: Int) throws -> Date {
        try #require(Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: 12)))
    }

    /// Parcours email jusqu'à l'étape username (compte créé, nom saisi).
    func viewModelAtUsernameStep() async throws -> OnboardingViewModel {
        let viewModel = makeViewModel(entry: .resume(.email))
        viewModel.password = "motdepasse"
        await viewModel.submitPassword()
        viewModel.birthDate = try date(2000, 1, 31)
        viewModel.submitBirthDate()
        viewModel.fullName = "Killian B"
        await viewModel.submitFullName()
        return viewModel
    }
}

final class TestClock {
    var now: Date

    init(now: Date) {
        self.now = now
    }
}

final class FinishedRecorder {
    var profiles: [Profile] = []
}
