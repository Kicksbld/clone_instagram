import SwiftUI

/**
 Pluie de confettis des célébrations (ADR-038) : un seul `Canvas` piloté par `TimelineView`, comme
 `LikeBurst`. Déclenchée à chaque changement de `trigger` ; rien si « Réduire les animations » est activé.
 */
struct ConfettiView: View {
    let trigger: Int
    @State private var shower: Shower?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: shower == nil)) { timeline in
            Canvas { canvas, size in
                shower?.draw(in: canvas, size: size, at: timeline.date)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: trigger, initial: true) {
            guard !reduceMotion, trigger > 0 else { return }
            shower = Shower(start: .now)
        }
        .task(id: shower?.start) {
            guard shower != nil else { return }
            do {
                try await Task.sleep(for: .seconds(Shower.duration))
            } catch {
                return
            }
            shower = nil
        }
    }
}

private struct Shower {
    static let duration = 2.6
    private static let colors: [Color] = [.cloneLime, .white, .likeRed, .cloneLime, .yellow]

    let start: Date
    private let pieces: [Piece]

    init(start: Date) {
        self.start = start
        var generator = SystemRandomNumberGenerator()
        pieces = (0 ..< 90).map { index in
            Piece(
                column: Double.random(in: 0 ... 1, using: &generator),
                delay: Double.random(in: 0 ... 0.5, using: &generator),
                speed: Double.random(in: 0.55 ... 1.1, using: &generator),
                drift: Double.random(in: -60 ... 60, using: &generator),
                spin: Double.random(in: 2 ... 9, using: &generator),
                size: Double.random(in: 6 ... 12, using: &generator),
                color: colors[index % colors.count],
                isRound: index.isMultiple(of: 3)
            )
        }
    }

    func draw(in canvas: GraphicsContext, size: CGSize, at date: Date) {
        let elapsed = date.timeIntervalSince(start)
        for piece in pieces {
            let time = elapsed - piece.delay
            guard time > 0 else { continue }
            let progress = time / (Self.duration - piece.delay)
            let top = -20 + time * piece.speed * size.height * 0.75 + 0.5 * 220 * time * time
            let left = piece.column * size.width + piece.drift * sin(time * 2.4)
            guard top < size.height + 20 else { continue }
            var context = canvas
            context.opacity = progress > 0.8 ? max(0, (1 - progress) / 0.2) : 1
            context.translateBy(x: left, y: top)
            context.rotate(by: .radians(time * piece.spin))
            let rect = CGRect(x: -piece.size / 2, y: -piece.size / 4, width: piece.size, height: piece.size / 2)
            let path = piece.isRound ? Path(ellipseIn: rect.insetBy(dx: piece.size / 6, dy: -piece.size / 8)) : Path(rect)
            context.fill(path, with: .color(piece.color))
        }
    }
}

private struct Piece {
    /// Position horizontale de départ, en fraction de la largeur.
    let column: Double
    let delay: Double
    let speed: Double
    let drift: Double
    let spin: Double
    let size: Double
    let color: Color
    let isRound: Bool
}
