import Foundation

nonisolated enum FileUploadError: Error, Equatable {
    /// Réseau indisponible ou transfert interrompu.
    case transferFailed
    /// Refus de Storage (URL expirée, fichier refusé…).
    case rejected(statusCode: Int)
}

/// Envoi d'un fichier vers une URL présignée (`PUT` du contenu brut, ADR-008).
protocol FileUploader: Sendable {
    func upload(fileURL: URL, to url: URL, contentType: String) async throws(FileUploadError)
}

/**
 `URLSession` en configuration background (ADR-008) : le transfert continue quand l'app passe en
 arrière-plan ; le système réveille l'app à la fin (`CloneInstagramApp`, `.backgroundTask(.urlSession)`).
 Une seule session par identifiant : instance partagée.
 */
final nonisolated class BackgroundFileUploader: NSObject, FileUploader, URLSessionTaskDelegate, @unchecked Sendable {
    static let sessionIdentifier = "com.killianboularand.cloneinstagram.uploads"
    static let shared = BackgroundFileUploader()

    private let lock = NSLock()
    /// Transferts en cours, par identifiant de tâche ; protégés par `lock`.
    private var continuations: [Int: CheckedContinuation<Void, any Error>] = [:]
    private var backgroundEventsContinuation: CheckedContinuation<Void, Never>?
    /// Créée au premier usage (le délégué est `self`) ; lue sous `lock`.
    private var backgroundSession: URLSession?

    override private init() {
        super.init()
    }

    func upload(fileURL: URL, to url: URL, contentType: String) async throws(FileUploadError) {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        do {
            try await withCheckedThrowingContinuation { continuation in
                lock.withLock {
                    let task = sessionLocked().uploadTask(with: request, fromFile: fileURL)
                    continuations[task.taskIdentifier] = continuation
                    task.resume()
                }
            }
        } catch let error as FileUploadError {
            throw error
        } catch {
            throw .transferFailed
        }
    }

    /// Appelé quand le système réveille l'app pour cette session : attend la fin de ses événements.
    func handleBackgroundEvents() async {
        await withCheckedContinuation { continuation in
            lock.withLock {
                backgroundEventsContinuation = continuation
                // Recrée la session si l'app a été relancée : ses événements sont alors livrés au délégué.
                _ = sessionLocked()
            }
        }
    }

    /// À appeler sous `lock`.
    private func sessionLocked() -> URLSession {
        if let backgroundSession {
            return backgroundSession
        }
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        backgroundSession = session
        return session
    }

    // MARK: - URLSessionTaskDelegate

    func urlSession(_: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let continuation = lock.withLock { continuations.removeValue(forKey: task.taskIdentifier) }
        guard let continuation else { return }
        if error != nil {
            continuation.resume(throwing: FileUploadError.transferFailed)
            return
        }
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        if (200 ..< 300).contains(status) {
            continuation.resume()
        } else {
            continuation.resume(throwing: FileUploadError.rejected(statusCode: status))
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession _: URLSession) {
        let continuation = lock.withLock {
            defer { backgroundEventsContinuation = nil }
            return backgroundEventsContinuation
        }
        continuation?.resume()
    }
}
