import Foundation

/// Issue d'une synchronisation optimiste, pour le store qui l'a lancée (ADR-020).
enum OptimisticOutcome<Intent, State, Failure: Error> {
    /// Un appel était déjà en cours pour cette clé : c'est lui qui enverra le nouvel état voulu.
    case pending
    /// État confirmé par l'API, conforme au dernier état voulu.
    case confirmed(State)
    /// Échec de l'envoi de `intent` : l'écran revient à `confirmed`, le dernier état confirmé.
    case failed(Failure, intent: Intent, confirmed: State)
}

extension OptimisticOutcome: Equatable where Intent: Equatable, State: Equatable, Failure: Equatable {}

/**
 Moteur commun des mises à jour optimistes (ADR-020), repris de l'algorithme des likes. Le store qui l'utilise
 affiche l'état voulu tout de suite, appelle `sync`, puis affiche l'état rendu.

 Par clé (identifiant du post, du compte…), jamais deux appels en parallèle : un changement pendant un appel ne
 modifie que l'état voulu, renvoyé à la fin de l'appel s'il diffère de celui que l'API a confirmé (le dernier
 choix gagne).
 */
final class OptimisticSync<Key: Hashable, Intent: Equatable> {
    /// État voulu, par clé, pendant qu'un appel est en cours.
    private var desired: [Key: Intent] = [:]

    /// Un appel est en cours : une lecture de l'API ne doit pas remplacer l'état affiché pour cette clé.
    func isSyncing(_ key: Key) -> Bool {
        desired[key] != nil
    }

    /// Déconnexion : un appel en cours se termine sans renvoyer d'état voulu.
    func reset() {
        desired = [:]
    }

    /**
     Envoie `intent` à l'API par `send`, puis le dernier état voulu tant qu'il diffère de l'état confirmé.

     - Parameters:
       - confirmed: dernier état confirmé par l'API, avant ce changement.
       - intentOf: l'état voulu que décrit un état confirmé (ex. `\.isLiked`).
       - send: l'appel à l'API, qui rend l'état confirmé.
     */
    func sync<State, Failure: Error>(
        _ key: Key,
        to intent: Intent,
        confirmed: State,
        intentOf: (State) -> Intent,
        send: (Intent) async throws(Failure) -> State
    ) async -> OptimisticOutcome<Intent, State, Failure> {
        let isSyncing = desired[key] != nil
        desired[key] = intent
        guard !isSyncing else { return .pending }
        defer { desired[key] = nil }

        var current = confirmed
        while let wanted = desired[key], wanted != intentOf(current) {
            do {
                current = try await send(wanted)
            } catch {
                return .failed(error, intent: wanted, confirmed: current)
            }
        }
        return .confirmed(current)
    }
}
