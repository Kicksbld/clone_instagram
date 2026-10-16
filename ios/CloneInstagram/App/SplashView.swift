import SwiftUI

/**
 Splash « Iris » au lancement (`ios/design/animations/splash.html`) : l'objectif éclot, se coupe en deux, le
 cadre se referme avec un rebond, le flash clignote deux fois, puis l'app s'ouvre à travers l'objectif.
 L'écran de lancement statique (`UILaunchScreen`, couleur `SplashBackground`) en est le premier frame : fond
 seul, sans logo. Sort quand l'entrée est finie et que `isReady` (route chargée) ; logo fixe puis fondu si
 « Réduire les animations » est activé.
 */
struct SplashView: View {
    let isReady: Bool
    let onFinished: () -> Void

    @State private var lensScale = 0.0
    /// Moitié droite pleine de l'objectif, qui se replie vers le centre pendant que son contour se trace.
    @State private var solidWidth = 1.0
    @State private var arcProgress = 0.0
    @State private var isFrameShown = false
    @State private var flashOpacity = 0.0
    @State private var isEntranceDone = false
    @State private var isExiting = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let logoSize: CGFloat = 88

    var body: some View {
        GeometryReader { proxy in
            let diagonal = hypot(proxy.size.width, proxy.size.height)
            Color.cloneInk
                .overlay { logo }
                .mask {
                    // Trou circulaire centré sur l'objectif, qui grandit jusqu'à découvrir tout l'écran.
                    Rectangle()
                        .overlay {
                            Circle()
                                .frame(width: diagonal, height: diagonal)
                                .scaleEffect(isExiting && !reduceMotion ? 1 : 0.001)
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                }
        }
        .ignoresSafeArea()
        .opacity(isExiting && reduceMotion ? 0 : 1)
        .allowsHitTesting(!isExiting)
        .accessibilityElement()
        .accessibilityLabel("Clone")
        .task { await playEntrance() }
        // Sortie déclenchée par `onChange`, qui lit la vue courante : la tâche de `playEntrance` garde la
        // copie de son lancement, où `isReady` est encore `false`.
        .onChange(of: isReady) { exitIfPossible() }
        .onChange(of: isEntranceDone) { exitIfPossible() }
    }

    private var logo: some View {
        ZStack {
            LogoFrame()
                .fill(.white)
                .scaleEffect(isFrameShown ? 1 : 1.4)
                .rotationEffect(.degrees(isFrameShown ? 0 : -12))
                .opacity(isFrameShown ? 1 : 0)
            LogoLensHalf(side: .leading)
                .fill(Color.cloneLime)
                .scaleEffect(lensScale)
            LogoLensHalf(side: .trailing)
                .fill(Color.cloneLime)
                .scaleEffect(x: solidWidth, y: 1)
                .scaleEffect(lensScale)
            LogoLensArc(progress: arcProgress)
                .fill(Color.cloneLime)
            LogoFlash()
                .fill(.white)
                .opacity(flashOpacity)
        }
        .frame(width: logoSize, height: logoSize)
        .scaleEffect(isExiting && !reduceMotion ? 3.2 : 1)
        .opacity(isExiting && !reduceMotion ? 0 : 1)
    }

    /// Entrée en 1,45 s ; s'arrête si la vue disparaît.
    private func playEntrance() async {
        guard !reduceMotion else {
            lensScale = 1
            solidWidth = 0.001
            arcProgress = 1
            isFrameShown = true
            flashOpacity = 1
            isEntranceDone = true
            return
        }
        withAnimation(.spring(duration: 0.46, bounce: 0.45)) { lensScale = 1 }
        guard await pause(0.56) else { return }
        withAnimation(.timingCurve(0.7, 0, 0.3, 1, duration: 0.3)) { solidWidth = 0.001 }
        withAnimation(.easeOut(duration: 0.34)) { arcProgress = 1 }
        guard await pause(0.08) else { return }
        withAnimation(.spring(duration: 0.5, bounce: 0.4)) { isFrameShown = true }
        guard await pause(0.42) else { return }
        for opacity in [1.0, 0.1, 1.0] {
            withAnimation(.linear(duration: 0.07)) { flashOpacity = opacity }
            guard await pause(0.075) else { return }
        }
        guard await pause(0.17) else { return }
        isEntranceDone = true
    }

    /// Attend `seconds` ; `false` si la tâche est annulée.
    private func pause(_ seconds: Double) async -> Bool {
        do {
            try await Task.sleep(for: .seconds(seconds))
            return true
        } catch {
            return false
        }
    }

    private func exitIfPossible() {
        guard isReady, isEntranceDone, !isExiting else { return }
        let animation: Animation = reduceMotion ? .easeOut(duration: 0.25) : .timingCurve(0.7, 0, 0.2, 1, duration: 0.52)
        withAnimation(animation) {
            isExiting = true
        } completion: {
            onFinished()
        }
    }
}
