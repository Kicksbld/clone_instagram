import SwiftUI

/// Repère du sound design (ADR-038) : un son court (`cue-<nom>.caf`, `ios/scripts/assets/generate-sounds.sh`)
/// joué avec une vibration.
enum FeedbackCue: String, CaseIterable, Sendable {
    /// Bouton principal.
    case tap
    /// Choix d'une réponse, étape validée.
    case tick
    /// Mot de la mascotte qui s'affiche.
    case blip
    /// Apparition d'un élément.
    case pop
    case like
    /// Réponse ou insight de la mascotte.
    case chime
    case success
    case error
    /// Carte suivante.
    case swipe
    /// Changement de partie du parcours.
    case whoosh
    /// Photo prise.
    case shutter

    /// Nom du fichier son dans le bundle (ressources à plat : préfixe unique).
    var soundName: String {
        "cue-\(rawValue)"
    }
}

/**
 Sons et vibrations de l'interface (ADR-038), seul accès à AVAudio et aux générateurs haptiques. Jamais
 bloquant : un son introuvable ou une session audio indisponible est ignoré.
 */
protocol FeedbackService: AnyObject {
    /// Sons coupés par le bouton de l'onboarding, mémorisé sur l'appareil ; les vibrations restent.
    var isMuted: Bool { get set }
    func play(_ cue: FeedbackCue)
}

/// Previews, tests et valeur par défaut de l'environnement : ni son ni vibration.
final class NoopFeedbackService: FeedbackService {
    var isMuted = false

    func play(_: FeedbackCue) {}
}

extension EnvironmentValues {
    /// Fourni par `RootView` ; lu par les composants de `DesignSystem/Onboarding` et les écrans du parcours.
    @Entry var feedback: any FeedbackService = NoopFeedbackService()
}
