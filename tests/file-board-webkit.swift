import AppKit
import WebKit

@MainActor final class FileBoardChecks: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 750))
    let window = NSWindow(contentRect: NSRect(x: -3000, y: -3000, width: 1100, height: 750), styleMask: [], backing: .buffered, defer: false)
    let bundle: String
    let fixture: String
    let css: String
    init(bundle: String, fixture: String, css: String) {
        self.bundle = bundle
        self.fixture = fixture
        self.css = css
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
            FileHandle.standardError.write(Data(("File board CSS failed: \(error)\n").utf8))
            exit(1)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: bundle, encoding: .utf8) + ";void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile: fixture, encoding: .utf8) + ";void 0")
                let result = try await web.callAsyncJavaScript("return await runFileBoardChecks()", arguments: [:], in: nil, contentWorld: .page)
                let data = try JSONSerialization.data(withJSONObject: result as Any, options: [.prettyPrinted, .sortedKeys])
                if let destination = ProcessInfo.processInfo.environment["FILE_BOARD_SCREENSHOT"] {
                    let image = try await web.takeSnapshot(configuration: nil)
                    if let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                        try png.write(to: URL(fileURLWithPath: destination))
                    }
                }
                FileHandle.standardOutput.write(data)
                exit((result as? [String: Any])?["passed"] as? Bool == true ? 0 : 1)
            } catch {
                FileHandle.standardError.write(Data(("File board WebKit test failed: \(error)\n").utf8))
                exit(1)
            }
        }
    }
}
@main @MainActor enum Entry {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let checks = FileBoardChecks(bundle: CommandLine.arguments[1], fixture: CommandLine.arguments[2], css: CommandLine.arguments[3])
        checks.start()
        withExtendedLifetime(checks) { app.run() }
    }
}
