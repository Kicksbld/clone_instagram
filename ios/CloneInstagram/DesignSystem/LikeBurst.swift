import SwiftUI

/**
 Bouton J'aime (animation « Éclats », `ios/design/animations/like.html`) : au like, le cœur rouge jaillit
 et projette des éclats ; à l'unlike, il rétrécit brièvement. Réagit au changement de `isLiked`, donc aussi
 au like par double tap ; sans mouvement si « Réduire les animations » est activé.
 */
struct LikeButton: View {
    let isLiked: Bool
    let action: () -> Void
    @State private var likes = 0
    @State private var unlikes = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(isLiked ? "Je n'aime plus" : "J'aime", systemImage: isLiked ? "heart.fill" : "heart", action: action)
            .foregroundStyle(isLiked ? AnyShapeStyle(Color.likeRed) : AnyShapeStyle(.primary))
            .keyframeAnimator(initialValue: 1.0, trigger: likes) { heart, scale in
                heart.scaleEffect(reduceMotion ? 1 : scale)
            } keyframes: { _ in
                KeyframeTrack {
                    MoveKeyframe(0.0)
                    CubicKeyframe(1.3, duration: 0.16)
                    CubicKeyframe(1.0, duration: 0.13)
                }
            }
            .keyframeAnimator(initialValue: 1.0, trigger: unlikes) { heart, scale in
                heart.scaleEffect(reduceMotion ? 1 : scale)
            } keyframes: { _ in
                KeyframeTrack {
                    MoveKeyframe(0.75)
                    SpringKeyframe(1.0, duration: 0.18)
                }
            }
            .overlay {
                LikeBurst(style: .button, trigger: likes)
                    .frame(width: 80, height: 80)
            }
            .sensoryFeedback(.impact(weight: .light), trigger: likes)
            .onChange(of: isLiked) { _, liked in
                if liked {
                    likes += 1
                } else {
                    unlikes += 1
                }
            }
    }
}

/**
 Grand cœur du double tap : il apparaît, se contracte puis éclate en éclats qui retombent sur la photo.
 Blanc avec une ombre : seule couleur lisible sur n'importe quelle photo. Simple apparition puis fondu si
 « Réduire les animations » est activé.
 */
struct DoubleTapHeart: View {
    /// Incrémenté à chaque double tap.
    let trigger: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Image(systemName: "heart.fill")
                .font(.system(size: 96))
                .foregroundStyle(.white)
                .shadow(radius: 8)
                .keyframeAnimator(initialValue: HeartFrame(), trigger: trigger) { heart, frame in
                    heart
                        .scaleEffect(reduceMotion ? 1 : frame.scale)
                        .opacity(frame.opacity)
                } keyframes: { _ in
                    KeyframeTrack(\.scale) {
                        MoveKeyframe(0.0)
                        CubicKeyframe(1.12, duration: 0.18)
                        CubicKeyframe(1.0, duration: 0.12)
                        CubicKeyframe(0.94, duration: 0.24)
                        CubicKeyframe(1.25, duration: LikeBurst.Style.photo.delay - 0.54)
                    }
                    KeyframeTrack(\.opacity) {
                        MoveKeyframe(1.0)
                        LinearKeyframe(1.0, duration: 0.54)
                        LinearKeyframe(0.0, duration: LikeBurst.Style.photo.delay - 0.54)
                    }
                }
            LikeBurst(style: .photo, trigger: trigger)
        }
        .clipped()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Échelle et opacité du grand cœur ; invisible au repos.
private struct HeartFrame {
    var scale = 1.0
    var opacity = 0.0
}

/**
 Éclats du like : petites formes reprises du logo (carré arrondi du cadre, demi-disque de l'objectif, point
 du flash) projetées depuis le centre. Un seul `Canvas` piloté par `TimelineView`, sans vue par éclat ; rien
 si « Réduire les animations » est activé.
 */
struct LikeBurst: View {
    enum Style {
        /// Bouton J'aime : 8 éclats en étoile, sans gravité.
        case button
        /// Double tap : 18 éclats qui retombent, au moment où le grand cœur éclate.
        case photo

        /// Départ des éclats après le déclenchement.
        var delay: TimeInterval {
            self == .button ? 0 : 0.62
        }

        /// Durée de la course des éclats.
        var flight: TimeInterval {
            self == .button ? 0.54 : 0.9
        }
    }

    let style: Style
    /// Incrémenté à chaque éclatement.
    let trigger: Int
    @State private var burst: Burst?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: burst == nil)) { timeline in
            Canvas { canvas, size in
                burst?.draw(in: canvas, size: size, at: timeline.date)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: trigger) {
            guard !reduceMotion else { return }
            burst = Burst(style: style, start: .now)
        }
        .task(id: burst?.start) {
            guard let style = burst?.style else { return }
            do {
                try await Task.sleep(for: .seconds(style.delay + style.flight))
            } catch {
                return
            }
            burst = nil
        }
    }
}

/// Un éclatement en cours : ses éclats et l'instant du déclenchement.
private struct Burst {
    let style: LikeBurst.Style
    let start: Date
    let shards: [Shard]

    init(style: LikeBurst.Style, start: Date) {
        self.style = style
        self.start = start
        shards = style == .button ? Shard.star() : Shard.shower()
    }

    func draw(in canvas: GraphicsContext, size: CGSize, at date: Date) {
        let elapsed = date.timeIntervalSince(start) - style.delay
        guard elapsed >= 0, elapsed <= style.flight else { return }
        let progress = elapsed / style.flight
        for shard in shards {
            var context = canvas
            let offset = shard.offset(elapsed: elapsed, progress: progress)
            context.translateBy(x: size.width / 2 + offset.x, y: size.height / 2 + offset.y)
            context.rotate(by: .degrees(shard.spin * progress))
            switch style {
            case .button:
                // Apparition rapide, puis l'éclat rapetisse et s'efface en s'éloignant.
                let scale = progress < 0.15 ? progress / 0.15 : 1 - 0.4 * (progress - 0.15) / 0.85
                context.scaleBy(x: scale, y: scale)
                context.opacity = 1 - progress
            case .photo:
                context.opacity = 1 - progress * progress
            }
            shard.kind.draw(in: context, size: shard.size, color: shard.color)
        }
    }
}

private struct Shard {
    enum Kind: CaseIterable {
        /// Carré arrondi en contour, comme le cadre.
        case frame
        /// Demi-disque plein, comme l'objectif.
        case lens
        /// Point, comme le flash.
        case flash

        func draw(in context: GraphicsContext, size: CGFloat, color: Color) {
            let rect = CGRect(x: -size / 2, y: -size / 2, width: size, height: size)
            switch self {
            case .frame:
                let lineWidth = max(2, size / 5)
                let outline = Path(roundedRect: rect.insetBy(dx: lineWidth / 2, dy: lineWidth / 2), cornerRadius: size / 3.2)
                context.stroke(outline, with: .color(color), lineWidth: lineWidth)
            case .lens:
                var half = Path()
                half.move(to: CGPoint(x: 0, y: -size / 2))
                half.addArc(center: .zero, radius: size / 2, startAngle: .degrees(-90), endAngle: .degrees(90), clockwise: true)
                half.closeSubpath()
                context.fill(half, with: .color(color))
            case .flash:
                context.fill(Path(ellipseIn: rect), with: .color(color))
            }
        }
    }

    enum Motion {
        /// Vers un point d'arrivée, en ralentissant.
        case radial(target: CGVector)
        /// Lancé à une vitesse (points par seconde), puis retombe.
        case ballistic(velocity: CGVector)
    }

    /// Accélération de la chute, en points par seconde au carré (divisée par deux).
    private static let gravity = 260.0

    let kind: Kind
    let color: Color
    let size: CGFloat
    /// Rotation totale sur la course, en degrés.
    let spin: Double
    let motion: Motion

    func offset(elapsed: TimeInterval, progress: Double) -> CGPoint {
        switch motion {
        case let .radial(target):
            let eased = 1 - pow(1 - progress, 3)
            return CGPoint(x: target.dx * eased, y: target.dy * eased)
        case let .ballistic(velocity):
            return CGPoint(x: velocity.dx * elapsed, y: velocity.dy * elapsed + Self.gravity * elapsed * elapsed)
        }
    }

    /// Bouton : 8 éclats en étoile, un sur trois à la couleur du texte, les autres en rouge.
    static func star() -> [Shard] {
        (0 ..< 8).map { index in
            let angle = Double(index) / 8 * 2 * .pi - .pi / 2
            let distance = 20 + Double(index % 2) * 7
            return Shard(
                kind: Kind.allCases[index % 3],
                color: index.isMultiple(of: 3) ? Color.primary : Color.likeRed,
                size: 7,
                spin: index.isMultiple(of: 2) ? -120 : 120,
                motion: .radial(target: CGVector(dx: cos(angle) * distance, dy: sin(angle) * distance))
            )
        }
    }

    /// Double tap : 18 éclats blancs, rouges et citron lancés dans toutes les directions, plutôt vers le haut.
    static func shower() -> [Shard] {
        let colors = [Color.white, Color.likeRed, Color.cloneLime]
        return (0 ..< 18).map { index in
            let angle = Double.random(in: 0 ..< 2 * .pi)
            let speed = Double.random(in: 70 ... 160)
            return Shard(
                kind: Kind.allCases[index % 3],
                color: colors[index % 3],
                size: .random(in: 8 ... 18),
                spin: index.isMultiple(of: 2) ? -200 : 200,
                motion: .ballistic(velocity: CGVector(dx: cos(angle) * speed, dy: sin(angle) * speed - 60))
            )
        }
    }
}
