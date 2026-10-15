import AppKit
import SwiftUI
import WebKit

@main @MainActor enum CloudHostsEntry {
    static func main() {
        let arguments = Array(CommandLine.arguments.dropFirst())
        let resources = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        if !arguments.isEmpty && arguments.first != "--background" {
            let process = Process()
            process.executableURL = resources.appendingPathComponent("node")
            process.arguments = [resources.appendingPathComponent("backend/cli.cjs").path] + arguments
            process.standardInput = FileHandle.standardInput
            process.standardOutput = FileHandle.standardOutput
            process.standardError = FileHandle.standardError
            do {try process.run(); process.waitUntilExit(); exit(process.terminationStatus)}
            catch {FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8)); exit(1)}
        }
        let app = NSApplication.shared, delegate = CloudHostsDelegate()
        app.delegate = delegate; app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) {app.run()}
    }
}
@MainActor final class CloudHostsDelegate: NSObject, NSApplicationDelegate {
    private var panel: ToolWindow?
    private var url: URL?
    func applicationDidFinishLaunching(_ notification: Notification) {
        ToolDock.install()
        let resources = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
        // With CFBundleIconName present AppKit already loads the named catalog
        // icon; fall back to the legacy icns setter only when that key is absent.
        if Bundle.main.object(forInfoDictionaryKey: "CFBundleIconName") == nil,
           let icon = NSImage(contentsOf: resources.appendingPathComponent("Aexus.icns")) {NSApp.applicationIconImage = icon}
        let process = Process(), pipe = Pipe()
        process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("backend/cli.cjs").path, "start"]
        process.standardOutput = pipe; process.standardError = FileHandle.standardError
        do {
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0,
                  let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let address = value["url"] as? String, let url = URL(string: address) else {
                throw NSError(domain: "CloudHosts", code: 1, userInfo: [NSLocalizedDescriptionKey: "Aexus 服务启动失败，请查看 CLI status 与日志"])
            }
            self.url = url
            if !CommandLine.arguments.contains("--background") {showWindow()}
        } catch {
            if CommandLine.arguments.contains("--background") {
                FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            } else {
                let alert = NSAlert(); alert.messageText = "Aexus Could Not Start"; alert.informativeText = error.localizedDescription; alert.runModal()
            }
            NSApp.terminate(nil)
        }
    }
    private func showWindow() {
        guard let url else {return}
        if panel == nil {
            panel = ToolWindow(title: "Aexus", size: NSSize(width: 1140, height: 780), supportsFullscreen: true) {CloudHostsWebView(url: url)}
        }
        panel?.show()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {showWindow(); return false}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {false}
}
struct CloudHostsWebView: NSViewRepresentable {
    let url: URL
    func makeCoordinator() -> StationCoordinator {StationCoordinator(url: url)}
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.userContentController.add(context.coordinator, name: "station")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.uiDelegate = context.coordinator
        context.coordinator.attach(web)
        var page = URLComponents(url: url, resolvingAgainstBaseURL: false)
        page?.queryItems = [URLQueryItem(name: "v", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)]
        web.load(URLRequest(url: page?.url ?? url)); return web
    }
    func updateNSView(_ web: WKWebView, context: Context) {}
    static func dismantleNSView(_ web: WKWebView, coordinator: StationCoordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "station")
        coordinator.detach()
    }
}

@MainActor final class StationCoordinator: NSObject, WKScriptMessageHandler, WKUIDelegate, NSDraggingSource {
    private let origin: URL
    private weak var web: WKWebView?
    private var preferredLanguage = "en"
    init(url: URL) {origin = url}
    func attach(_ web: WKWebView) {self.web = web}
    func detach() {web = nil}
    private func file(_ id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else {throw CocoaError(.fileReadInvalidFileName)}
        let home = ProcessInfo.processInfo.environment["CLOUD_HOSTS_HOME"].map {URL(fileURLWithPath: $0)} ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Toolbox/CloudHosts")
        let folder = home.appendingPathComponent("station")
        let records = try JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("index.json"))) as? [[String: Any]] ?? []
        guard var record = records.first(where: {$0["id"] as? String == id}) else {throw CocoaError(.fileNoSuchFile)}
        var names: [String] = []
        while true {
            guard let name = record["name"] as? String, name == (name as NSString).lastPathComponent else {throw CocoaError(.fileReadInvalidFileName)}
            names.insert(name, at: 0)
            guard let parent = record["parent"] as? String, let next = records.first(where: {$0["id"] as? String == parent}) else {break}
            record = next
        }
        return names.reduce(folder.appendingPathComponent("content")) {$0.appendingPathComponent($1)}
    }
    private func notify(_ value: [String: String]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else {return}
        web?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('station-native-result',{detail:" + json + "}))", completionHandler: nil)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.absoluteString.hasPrefix(origin.absoluteString) == true,
              let body = message.body as? [String: Any], let type = body["type"] as? String else {return}
        if type == "language", let language = body["value"] as? String, ["en", "zh"].contains(language) {
            preferredLanguage = language
            web?.window?.title = language == "zh" ? "云主机" : "Cloud Hosts"
            return
        }
        do {
            if type == "open-link", let address = body["url"] as? String,
               let url = URL(string: address), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                NSWorkspace.shared.open(url)
            } else if type == "save", let id = body["id"] as? String {
                let source = try file(id), panel = NSSavePanel()
                panel.nameFieldStringValue = source.lastPathComponent
                panel.prompt = preferredLanguage == "zh" ? "保存文件" : "Save"
                guard let window = web?.window else {return}
                panel.beginSheetModal(for: window) { [weak self] result in
                    guard result == .OK, let destination = panel.url else {return}
                    let temporary = destination.deletingLastPathComponent().appendingPathComponent(".cloud-hosts-save-" + UUID().uuidString)
                    do {
                        try FileManager.default.copyItem(at: source, to: temporary)
                        if FileManager.default.fileExists(atPath: destination.path) {
                            _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary)
                        } else {try FileManager.default.moveItem(at: temporary, to: destination)}
                        self?.notify(["message": "已保存：" + destination.lastPathComponent])
                    } catch {try? FileManager.default.removeItem(at: temporary);self?.notify(["error": error.localizedDescription])}
                }
            } else if type == "drag", let ids = body["ids"] as? [String], let x = (body["x"] as? NSNumber)?.doubleValue, let y = (body["y"] as? NSNumber)?.doubleValue, let web, let window = web.window {
                // WebKit messages arrive after the original mouse event. Use the
                // authenticated pointer location from this view for AppKit's drag.
                let location = NSPoint(x: x, y: web.isFlipped ? y : web.bounds.height - y)
                guard let event = NSEvent.mouseEvent(with: .leftMouseDown, location: web.convert(location, to: nil), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) else {return}
                let items = try ids.enumerated().map { index, id -> NSDraggingItem in
                    let source = try file(id), item = NSDraggingItem(pasteboardWriter: source as NSURL)
                    let image = NSWorkspace.shared.icon(forFile: source.path);image.size = NSSize(width: 36, height: 36)
                    item.setDraggingFrame(NSRect(x: location.x + CGFloat(index * 4), y: location.y - 18, width: 36, height: 36), contents: image)
                    return item
                }
                notify(["message": "正在拖出文件，松开即可复制"] )
                web.beginDraggingSession(with: items, event: event, source: self)
            }
        } catch {notify(["error": error.localizedDescription])}
    }
    func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation {context == .outsideApplication ? .copy : []}
    func draggingSession(_ session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation) {
        if operation.contains(.copy) {notify(["message": "已复制到目标位置，中转站副本仍保留"])}
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel();panel.canChooseFiles = !parameters.allowsDirectories;panel.canChooseDirectories = parameters.allowsDirectories;panel.allowsMultipleSelection = parameters.allowsMultipleSelection;panel.prompt = "存入中转站"
        guard let window = webView.window else {completionHandler(nil);return}
        panel.beginSheetModal(for: window) {result in completionHandler(result == .OK ? panel.urls : nil)}
    }
}
