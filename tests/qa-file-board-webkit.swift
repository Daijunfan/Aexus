import AppKit
import WebKit

// QA-owned wrapper around tests/file-board-webkit.swift.
//
// The inherited harness evaluates dist/ui/files.bundle.js in a bare page
// without defining window.cloudClientReady / window.cloudClients first, which
// ui/app.js:34 normally defines before any bundle is loaded. Evaluating the
// bundle therefore throws
//   TypeError: undefined is not an object (evaluating 'window.cloudClientReady["files"]=...')
// before a single check runs. The sibling harnesses
// (tests/agent-board-webkit.swift:31, tests/terminal-input-webkit.swift:16)
// do define the two objects first.
//
// This wrapper defines the same two objects, then loads the bundle, the fixture
// and runs the requested check entry point, so the file-board fixtures can be
// verified against the shipped bundle without editing the inherited harness.
//
//   qa-file-board-webkit BUNDLE FIXTURE CSS [ENTRY=runFileBoardChecks]
@MainActor final class QaFileBoardChecks: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 750))
    let window = NSWindow(contentRect: NSRect(x: -3000, y: -3000, width: 1100, height: 750), styleMask: [], backing: .buffered, defer: false)
    let bundle: String
    let fixture: String
    let css: String
    let entry: String
    init(bundle: String, fixture: String, css: String, entry: String) {
        self.bundle = bundle
        self.fixture = fixture
        self.css = css
        self.entry = entry
        super.init()
        window.contentView = web
        web.navigationDelegate = self
    }
    func start() {
        do {
            let stylesheet = try String(contentsOfFile: css, encoding: .utf8)
            let html = "<html><head><style>" + stylesheet + "</style></head><body><div id='root' style='width:1000px;height:700px'></div></body></html>"
            web.loadHTMLString(html, baseURL: URL(string: "http://127.0.0.1/"))
        } catch {
            FileHandle.standardError.write(Data(("QA file board CSS failed: \(error)\n").utf8))
            exit(1)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                _ = try await web.evaluateJavaScript("window.cloudClients = {}; window.cloudClientReady = {}; void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: bundle, encoding: .utf8) + ";void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: fixture, encoding: .utf8) + ";void 0")
                let result = try await web.callAsyncJavaScript("return await window[entry]()", arguments: ["entry": entry], in: nil, contentWorld: .page)
                let data = try JSONSerialization.data(withJSONObject: result as Any, options: [.prettyPrinted, .sortedKeys])
                FileHandle.standardOutput.write(data)
                exit((result as? [String: Any])?["passed"] as? Bool == true ? 0 : 1)
            } catch {
                FileHandle.standardError.write(Data(("QA file board WebKit test failed: \(error)\n").utf8))
                exit(1)
            }
        }
    }
}
@main @MainActor enum QaFileBoardEntry {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        guard CommandLine.arguments.count >= 4 else {
            FileHandle.standardError.write(Data("usage: qa-file-board-webkit BUNDLE FIXTURE CSS [ENTRY]\n".utf8))
            exit(2)
        }
        let entry = CommandLine.arguments.count >= 5 ? CommandLine.arguments[4] : "runFileBoardChecks"
        let checks = QaFileBoardChecks(bundle: CommandLine.arguments[1], fixture: CommandLine.arguments[2], css: CommandLine.arguments[3], entry: entry)
        checks.start()
        withExtendedLifetime(checks) { app.run() }
    }
}
