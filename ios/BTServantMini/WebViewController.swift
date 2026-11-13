// The app is one WKWebView with the same page as the Android app (web/src, built by web/build.py into www). Links to other
// sites open in Safari; the connection (for online AI and the connection notice) comes from NWPathMonitor.
import Network
import UIKit
import WebKit

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private let monitor = NWPathMonitor()
    private var online = true
    private var selfTestStarted = false
    private static let background = UIColor(red: 0x26 / 255.0, green: 0x26 / 255.0, blue: 0x24 / 255.0, alpha: 1)

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SchemeHandler(), forURLScheme: SchemeHandler.scheme)
        config.websiteDataStore = .default()
        let content = WKUserContentController()
        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0") + "-mini-ios"
        content.addUserScript(WKUserScript(source: Bridge.script(version: version, status: Engine.shared.status, online: online),
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakHandler(self), name: Bridge.handler)
        config.userContentController = content
        web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = Self.background
        web.scrollView.backgroundColor = Self.background
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        Engine.shared.onStatus = { [weak self] s in self?.set("status", Bridge.js(s)) }
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let up = path.status == .satisfied
                guard up != self.online else { return }
                self.online = up
                self.set("online", String(up))
                self.web.evaluateJavaScript("window.dispatchEvent(new Event('\(up ? "online" : "offline")'))")
            }
        }
        monitor.start(queue: .global(qos: .utility))
        web.load(URLRequest(url: SchemeHandler.start))
    }

    private func set(_ key: String, _ literal: String) {
        web.evaluateJavaScript("window.__iosState && (window.__iosState.\(key) = \(literal))")
    }

    // --------------------------------------------------------------------------------------------------------- bridge

    fileprivate func received(_ message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], let op = m["op"] as? String else { return }
        switch op {
        case "complete":
            let id = m["id"] as? String ?? ""
            Engine.shared.complete(body: m["body"] as? String ?? "") { [weak self] result in
                DispatchQueue.main.async {
                    self?.web.evaluateJavaScript("window.__llm && window.__llm(\(Bridge.js(id)), \(Bridge.js(result)))")
                }
            }
        case "download":
            Engine.shared.download(url: m["url"] as? String ?? "", sha: m["sha"] as? String ?? "", size: m["size"] as? String ?? "")
        case "selftest":
            SelfTest.record(step: m["step"] as? String ?? "?", data: m["data"] as? String ?? "")
        default:
            break
        }
    }

    // ----------------------------------------------------------------------------------------------------- navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == SchemeHandler.scheme || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            return decisionHandler(.allow)
        }
        // another site (a link in an answer, the project page): Safari
        if action.navigationType == .linkActivated || action.targetFrame?.isMainFrame == true {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // what changed while the page was loading (the model may have finished starting)
        set("status", Bridge.js(Engine.shared.status))
        set("online", String(online))
        if SelfTest.enabled && !selfTestStarted {
            selfTestStarted = true
            webView.evaluateJavaScript(SelfTest.script)
        }
    }

    // iOS may stop the page's process (memory): load it again
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: SchemeHandler.start))
    }

    // the page does not use alert() or confirm(), but a script might: show them rather than leave the page waiting
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }
}

/// WKUserContentController keeps its handlers alive: a weak link back avoids keeping the controller forever.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WebViewController?
    init(_ target: WebViewController) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { target?.received(message) }
}
