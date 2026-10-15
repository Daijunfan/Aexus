import AppKit
import WebKit

@MainActor final class AgentBoardChecks: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 750))
    let window = NSWindow(contentRect: NSRect(x: -3000, y: -3000, width: 1100, height: 750), styleMask: [], backing: .buffered, defer: false)
    let bundle: String
    let fixture: String
    let stylesheets: [String]
    init(bundle: String, fixture: String, stylesheets: [String]) {
        self.bundle = bundle
        self.fixture = fixture
        self.stylesheets = stylesheets
        super.init()
        window.contentView = web
        web.navigationDelegate = self
    }
    func start() {
        do {
            // The Agent Board ships its own stylesheet next to the shared one, so
            // load every stylesheet argument instead of silently dropping the rest.
            let stylesheet = try stylesheets.map { try String(contentsOfFile: $0, encoding: .utf8) }.joined(separator: "\n")
            let html = "<html><head><style>" + stylesheet + "</style></head><body><div id='root' style='width:1000px;height:700px'></div></body></html>"
            web.loadHTMLString(html, baseURL: URL(string: "http://127.0.0.1/"))
        } catch {
            FileHandle.standardError.write(Data(("Agent board CSS failed: \(error)\n").utf8))
            exit(1)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                _ = try await web.evaluateJavaScript("window.cloudClientReady = {}; window.cloudClients = {};")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: bundle, encoding: .utf8) + ";void 0")
                let assetRoot = URL(fileURLWithPath: bundle).deletingLastPathComponent().appendingPathComponent("os")
                var icons: [String: String] = [:]
                for name in ["macos","windows","linux","ubuntu","kali","debian"] {
                    if let svg = try? Data(contentsOf: assetRoot.appendingPathComponent(name + ".svg")) {
                        icons["./os/" + name + ".svg"] = "data:image/svg+xml;base64," + svg.base64EncodedString()
                    }
                }
                for name in ["codex","claude","cline","pi"] {
                    let file = assetRoot.deletingLastPathComponent().appendingPathComponent("engines/" + name + ".svg")
                    if let svg = try? Data(contentsOf: file) {
                        icons["./engines/" + name + ".svg"] = "data:image/svg+xml;base64," + svg.base64EncodedString()
                    }
                }
                let iconJSON = String(data: try JSONSerialization.data(withJSONObject: icons), encoding: .utf8)!
                _ = try await web.evaluateJavaScript("window.fixtureIcons=" + iconJSON + ";new MutationObserver(()=>document.querySelectorAll('img').forEach(img=>{const data=fixtureIcons[img.getAttribute('src')];if(data)img.src=data})).observe(document.body,{childList:true,subtree:true});void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: fixture, encoding: .utf8) + ";void 0")
                let result = try await web.callAsyncJavaScript("return await runAgentBoardChecks()", arguments: [:], in: nil, contentWorld: .page)
                let data = try JSONSerialization.data(withJSONObject: result as Any, options: [.prettyPrinted, .sortedKeys])
                if let screenshot = ProcessInfo.processInfo.environment["AGENT_BOARD_SCREENSHOT"] {
                    let image = try await web.takeSnapshot(configuration: nil)
                    if let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                        try png.write(to: URL(fileURLWithPath: screenshot))
                    }
                }
                FileHandle.standardOutput.write(data)
                exit((result as? [String: Any])?["passed"] as? Bool == true ? 0 : 1)
            } catch {
                FileHandle.standardError.write(Data(("Agent board WebKit test failed: \(String(describing:error).prefix(500))\n").utf8))
                exit(1)
            }
        }
    }
}
@main @MainActor enum Entry {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let checks = AgentBoardChecks(bundle: CommandLine.arguments[1], fixture: CommandLine.arguments[2], stylesheets: Array(CommandLine.arguments.dropFirst(3)))
        checks.start()
        withExtendedLifetime(checks) { app.run() }
    }
}
