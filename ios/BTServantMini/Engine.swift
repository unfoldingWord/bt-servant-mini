// The model's file and state, for the page: downloaded once from the packs servers (the page gives the addresses, separated by
// spaces and tried in order, the SHA-256 and the size, as on Android), checked, kept in Application Support (not in iCloud
// backups) and loaded at launch.
// The state is the Android app's: "missing", "downloading:42", "starting", "ready", "error:…".
import CryptoKit
import Foundation

final class Engine: NSObject, URLSessionDownloadDelegate {
    static let shared = Engine()

    /// Called on the main queue whenever the state changes.
    var onStatus: ((String) -> Void)?
    /// Read and written on the main queue only (set() moves there).
    private(set) var status = "missing"

    private func set(_ s: String) {
        if Thread.isMainThread {
            guard s != status else { return }
            status = s
            onStatus?(s)
        } else {
            DispatchQueue.main.async { self.set(s) }
        }
    }

    private let queue = DispatchQueue(label: "org.unfoldingword.btservantmini.llama", qos: .userInitiated)
    private var llama: Llama?
    private var expected: (sha: String, size: Int64)?
    /// The addresses not tried yet in this download: the next one is tried when one fails.
    private var next: [URL] = []
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)

    static var modelFile: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("model")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("model.gguf")
    }

    /// At launch: load the model if it was downloaded before.
    func start() {
        if FileManager.default.fileExists(atPath: Self.modelFile.path) { load() } else { set("missing") }
    }

    private func load() {
        set("starting")
        queue.async {
            do {
                self.llama = try Llama(path: Self.modelFile.path)
                self.set("ready")
            } catch {
                self.llama = nil
                self.set("error:\(error.localizedDescription)")
            }
        }
    }

    // ------------------------------------------------------------------------------------------------------- download

    /// `url`: one address, or several separated by spaces (Mini's packs server first, the old one after it).
    func download(url: String, sha: String, size: String) {
        let urls = url.split(whereSeparator: { $0.isWhitespace }).compactMap { URL(string: String($0)) }
        guard status == "missing" || status.hasPrefix("error"), let first = urls.first else { return }
        expected = (sha.lowercased(), Int64(size) ?? 0)
        next = Array(urls.dropFirst())
        set("downloading:0")
        session.downloadTask(with: first).resume()
    }

    /// After a failed try: the next address, or the error when none is left. Main queue.
    private func failed(_ message: String) {
        if !next.isEmpty {
            let u = next.removeFirst()
            set("downloading:0")
            session.downloadTask(with: u).resume()
        } else {
            set("error:\(message)")
        }
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten done: Int64,
                    totalBytesExpectedToWrite total: Int64) {
        let all = total > 0 ? total : (expected?.size ?? 0)
        guard all > 0 else { return }
        set("downloading:\(min(99, Int(done * 100 / all)))")
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // the temporary file is gone when this returns: check and move it here
        do {
            if let code = (downloadTask.response as? HTTPURLResponse)?.statusCode, code != 200 { throw Failure("HTTP \(code)") }
            if let sha = expected?.sha, !sha.isEmpty, try Self.sha256(of: location) != sha { throw Failure("the file is damaged (SHA-256)") }
            let dest = Self.modelFile
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: location, to: dest)
            var url = dest
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
            load()
            DispatchQueue.main.async { self.next = [] }
        } catch {
            let message = error.localizedDescription
            // a server error, a missing file or damaged bytes from one server: the next server may have it whole
            DispatchQueue.main.async { self.failed(message) }
        }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        DispatchQueue.main.async {
            if self.status.hasPrefix("downloading") { self.failed(error.localizedDescription) }
        }
    }

    private static func sha256(of file: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: file)
        defer { try? h.close() }
        var hasher = SHA256()
        while let chunk = try h.read(upToCount: 4 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    // ----------------------------------------------------------------------------------------------------- completion

    /// `body` is the page's JSON ({prompt, n_predict, stop, grammar, …}); the reply is {"content": …} or "ERROR:…", as on Android.
    func complete(body: String, reply: @escaping (String) -> Void) {
        queue.async {
            guard let llama = self.llama else { return reply("ERROR:the model is not loaded") }
            do {
                guard let o = try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any],
                      let prompt = o["prompt"] as? String else { throw Failure("no prompt") }
                let text = try llama.complete(prompt: prompt, nPredict: o["n_predict"] as? Int ?? 200, stop: o["stop"] as? [String] ?? [],
                                              grammar: o["grammar"] as? String)
                let out = try JSONSerialization.data(withJSONObject: ["content": text])
                reply(String(decoding: out, as: UTF8.self))
            } catch {
                reply("ERROR:\(error.localizedDescription)")
            }
        }
    }
}

struct Failure: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}
