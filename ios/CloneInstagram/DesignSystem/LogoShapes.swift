import SwiftUI

/**
 Parties du logo, dessinées comme `ios/design/app-icons/AppIcon.svg` pour être animées séparément (splash).
 Toutes partagent le même repère : le carré du logo, cadre compris (unités SVG 92 à 420, centre en 256),
 centré dans le rectangle reçu. Le centre du logo est aussi celui de l'objectif.
 */
private nonisolated struct LogoSpace {
    let rect: CGRect

    var unit: CGFloat {
        min(rect.width, rect.height) / 328
    }

    var lensCenter: CGPoint {
        CGPoint(x: rect.midX, y: rect.midY)
    }

    func point(svgX: CGFloat, svgY: CGFloat) -> CGPoint {
        CGPoint(x: rect.midX + (svgX - 256) * unit, y: rect.midY + (svgY - 256) * unit)
    }
}

/// Cadre blanc du logo (carré arrondi tracé de 30 unités), à remplir.
nonisolated struct LogoFrame: Shape {
    func path(in rect: CGRect) -> Path {
        let space = LogoSpace(rect: rect)
        let side = 288 * space.unit
        let frame = CGRect(origin: space.point(svgX: 112, svgY: 112), size: CGSize(width: side, height: side))
        return Path(roundedRect: frame, cornerRadius: 80 * space.unit, style: .circular)
            .strokedPath(StrokeStyle(lineWidth: 30 * space.unit))
    }
}

/// Moitié pleine de l'objectif : la gauche dans le logo, la droite seulement pendant le splash.
nonisolated struct LogoLensHalf: Shape {
    enum Side {
        case leading
        case trailing
    }

    let side: Side

    func path(in rect: CGRect) -> Path {
        let space = LogoSpace(rect: rect)
        var path = Path()
        path.move(to: space.point(svgX: 256, svgY: 186))
        // Repère SwiftUI inversé : `clockwise: true` passe visuellement par la gauche.
        path.addArc(
            center: space.lensCenter,
            radius: 70 * space.unit,
            startAngle: .degrees(-90),
            endAngle: .degrees(90),
            clockwise: side == .leading
        )
        path.closeSubpath()
        return path
    }
}

/// Moitié droite de l'objectif, en contour, tracée de haut en bas jusqu'à `progress` (splash), à remplir.
nonisolated struct LogoLensArc: Shape {
    var progress: CGFloat = 1

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let space = LogoSpace(rect: rect)
        var arc = Path()
        arc.move(to: space.point(svgX: 256, svgY: 186))
        arc.addArc(
            center: space.lensCenter,
            radius: 70 * space.unit,
            startAngle: .degrees(-90),
            endAngle: .degrees(90),
            clockwise: false
        )
        return arc
            .trimmedPath(from: 0, to: progress)
            .strokedPath(StrokeStyle(lineWidth: 22 * space.unit))
    }
}

/// Point du flash, en haut à droite du cadre.
nonisolated struct LogoFlash: Shape {
    func path(in rect: CGRect) -> Path {
        let space = LogoSpace(rect: rect)
        let radius = 18 * space.unit
        let center = space.point(svgX: 340, svgY: 172)
        return Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }
}

/// Logo complet au repos ; `ink` colore le cadre et le flash (blanc sur le splash, couleur du texte ailleurs).
struct LogoMark: View {
    var ink: Color = .primary

    var body: some View {
        ZStack {
            LogoFrame().fill(ink)
            LogoLensHalf(side: .leading).fill(Color.cloneLime)
            LogoLensArc().fill(Color.cloneLime)
            LogoFlash().fill(ink)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}
