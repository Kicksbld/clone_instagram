import SwiftUI

/// Description du contenu visuel, distincte de la légende ; pas de texte inventé si elle est absente.
struct AltTextField: View {
    var title = "Description alternative"
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField(title, text: $text, axis: .vertical)
                .lineLimit(2 ... 6)
                .accessibilityHint(
                    "Décrivez le contenu visuel pour une personne qui ne voit pas le média. Facultatif, 1 000 caractères maximum."
                )
            Text("Décrivez ce que montre le média. \(text.unicodeScalars.count)/1 000 caractères.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
