/// Centre d'intérêt choisi au quiz de l'onboarding (ADR-038) : gardé dans l'app, jamais envoyé à l'API ;
/// personnalise la suite du parcours et le paywall de fin d'onboarding.
enum OnboardingInterest: String, CaseIterable, Sendable {
    case travel
    case food
    case sport
    case art
    case animals
    case fashion
    case music

    var title: String {
        switch self {
        case .travel: "Voyages"
        case .food: "Cuisine"
        case .sport: "Sport"
        case .art: "Art et création"
        case .animals: "Animaux"
        case .fashion: "Mode"
        case .music: "Musique"
        }
    }

    var symbol: String {
        switch self {
        case .travel: "airplane"
        case .food: "fork.knife"
        case .sport: "figure.run"
        case .art: "paintpalette.fill"
        case .animals: "pawprint.fill"
        case .fashion: "tshirt.fill"
        case .music: "music.note"
        }
    }
}
