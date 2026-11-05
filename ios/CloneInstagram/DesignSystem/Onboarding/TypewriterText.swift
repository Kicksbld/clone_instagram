import SwiftUI

/**
 Texte de la mascotte révélé mot à mot, un repère `blip` tous les deux mots ; un appui affiche tout. Texte
 complet d'emblée si « Réduire les animations » est activé. VoiceOver lit toujours le texte complet.
 */
struct TypewriterText: View {
    let text: String
    var wordDelay: Duration = .milliseconds(70)
    var onFinished: () -> Void = {}
    @State private var shownWords = 0
    @Environment(\.feedback) private var feedback
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var words: [Substring] {
        text.split(separator: " ")
    }

    var body: some View {
        // Texte complet invisible dessous : la bulle garde sa taille finale pendant la révélation.
        ZStack {
            Text(text).hidden()
            Text(words.prefix(shownWords).joined(separator: " "))
        }
        .accessibilityElement()
        .accessibilityLabel(text)
        .contentShape(.rect)
        .onTapGesture { revealAll() }
        .accessibilityAction(named: "Afficher tout le texte") { revealAll() }
        .task(id: text) { await reveal() }
    }

    private func reveal() async {
        shownWords = 0
        guard !reduceMotion, !voiceOverEnabled else {
            revealAll()
            return
        }
        for index in words.indices {
            do {
                try await Task.sleep(for: wordDelay)
            } catch {
                return
            }
            guard shownWords < words.count else { return }
            shownWords = index + 1
            if index.isMultiple(of: 2) {
                feedback.play(.blip)
            }
        }
        onFinished()
    }

    private func revealAll() {
        guard shownWords < words.count else { return }
        shownWords = words.count
        onFinished()
    }
}
