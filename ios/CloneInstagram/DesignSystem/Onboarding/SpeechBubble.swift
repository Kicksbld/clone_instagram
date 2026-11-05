import SwiftUI

/// Bulle de la mascotte : texte révélé mot à mot (`TypewriterText`), pointe vers le haut.
struct SpeechBubble: View {
    let text: String
    var onFinished: () -> Void = {}

    var body: some View {
        TypewriterText(text: text, onFinished: onFinished)
            .font(.onboardingBody(.title3, weight: .semibold))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(Color.onboardingSurface, in: .rect(cornerRadius: 24))
            .overlay(alignment: .top) {
                Triangle()
                    .fill(Color.onboardingSurface)
                    .frame(width: 22, height: 12)
                    .offset(y: -12)
            }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}
