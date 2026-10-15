import AppKit
import WebKit

@MainActor final class InputChecks: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 650))
    let bundle: String
    let fixture: String
    init(bundle: String, fixture: String) {self.bundle = bundle;self.fixture = fixture;super.init();web.navigationDelegate = self}
    func start() {
        let css=CommandLine.arguments.count>3 ? (try? String(contentsOfFile:CommandLine.arguments[3],encoding:.utf8)) ?? "" : ""
        web.loadHTMLString("<html><style>"+css+".terminal-surface{height:480px;width:350px!important;flex:none}#root{width:370px;height:560px;display:flex;flex-direction:column}</style><body><div id='root'></div></body></html>",baseURL:URL(string:"http://127.0.0.1/"))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task {@MainActor in
            do {
                _ = try await web.evaluateJavaScript("window.cloudClients={};window.cloudClientReady={};void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile:bundle,encoding:.utf8)+";void 0")
                _ = try await web.evaluateJavaScript(try String(contentsOfFile:fixture,encoding:.utf8)+";void 0")
                let value = try await web.callAsyncJavaScript("return await runTerminalInputChecks()",arguments:[:],in:nil,contentWorld:.page)
                let data = try JSONSerialization.data(withJSONObject:value as Any,options:[.prettyPrinted,.sortedKeys])
                FileHandle.standardOutput.write(data)
                exit((value as? [String:Any])?["passed"] as? Bool == true ? 0 : 1)
            } catch {FileHandle.standardError.write(Data(("Native WebKit input check failed: \(error)\n").utf8));exit(1)}
        }
    }
}
@main @MainActor enum Entry {
    static func main() {
        let app=NSApplication.shared;app.setActivationPolicy(.accessory)
        let checks=InputChecks(bundle:CommandLine.arguments[1],fixture:CommandLine.arguments[2]);checks.start()
        withExtendedLifetime(checks) {app.run()}
    }
}
