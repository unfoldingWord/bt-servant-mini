// window.Android for the page, in the iOS app. The page calls the Android bridge synchronously (status(), ready()…), and
// WKWebView can only send messages: so the script keeps the app's state in window.__iosState (the app updates it), answers
// the synchronous calls from there, and sends the rest (complete, download) to the app as messages.
import Foundation

enum Bridge {
    static let handler = "btsm"

    static func script(version: String, status: String, online: Bool) -> String {
        """
        (() => {
          const S = window.__iosState = { version: \(js(version)), status: \(js(status)), online: \(online) }
          const post = (m) => window.webkit.messageHandlers.\(handler).postMessage(m)
          const no = 'not available on iPhone yet'
          window.Android = {
            platform: () => 'ios',
            complete: (id, body) => post({ op: 'complete', id: String(id), body: String(body) }),
            ready: () => S.status === 'ready',
            status: () => S.status,
            flavor: () => 'lite',
            version: () => S.version,
            online: () => S.online,
            downloadModel: (url, sha, size) => post({ op: 'download', url: String(url), sha: String(sha), size: String(size) }),
            pickModel: () => {},
            exportModel: () => no,
            saveBegin: () => no,
            saveChunk: () => no,
            saveEnd: () => no,
          }
        })()
        """
    }

    /// A string as a JavaScript literal.
    static func js(_ s: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed)) ?? Data("\"\"".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}
