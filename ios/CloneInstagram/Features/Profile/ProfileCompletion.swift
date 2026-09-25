/// Carte « Compléter votre profil » de mon profil : étapes faites ou restantes.
struct ProfileCompletion: Equatable {
    enum Step: CaseIterable {
        case photo
        case bio
        /// Sans action jusqu'au bouton Suivre (T5).
        case followAccounts

        var title: String {
            switch self {
            case .photo: "Ajouter une photo de profil"
            case .bio: "Ajouter une bio"
            case .followAccounts: "Suivre des comptes"
            }
        }

        var systemImage: String {
            switch self {
            case .photo: "person.crop.circle"
            case .bio: "text.bubble"
            case .followAccounts: "person.2"
            }
        }
    }

    let completedSteps: Set<Step>

    init(profile: Profile) {
        var steps = Set<Step>()
        if profile.avatar != nil {
            steps.insert(.photo)
        }
        if !profile.bio.isEmpty {
            steps.insert(.bio)
        }
        if profile.followingCount > 0 {
            steps.insert(.followAccounts)
        }
        completedSteps = steps
    }

    var completedCount: Int {
        completedSteps.count
    }

    var totalCount: Int {
        Step.allCases.count
    }

    /// Toutes les étapes faites : la carte n'est plus affichée.
    var isComplete: Bool {
        completedCount == totalCount
    }

    func isCompleted(_ step: Step) -> Bool {
        completedSteps.contains(step)
    }
}
