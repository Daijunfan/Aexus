import AppKit
import WebKit

@MainActor final class Render: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x:0,y:0,width:1140,height:780))
    let window = NSWindow(contentRect:NSRect(x:-3000,y:-3000,width:1140,height:780),styleMask:[],backing:.buffered,defer:false)
    func start() {window.contentView=web;web.navigationDelegate=self;web.load(URLRequest(url:URL(string:CommandLine.arguments[1])!))}
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
        Task {@MainActor in
            do {
                for _ in 0..<200 {
                    if try await web.evaluateJavaScript("!!document.querySelector('.board-card .terminal-toolbar')") as? Bool == true {break}
                    try await Task.sleep(nanoseconds:50_000_000)
                }
                try await Task.sleep(nanoseconds:300_000_000)
                let config=WKSnapshotConfiguration();config.rect=web.bounds;config.snapshotWidth=1140;config.afterScreenUpdates=false
                let image=try await web.takeSnapshot(configuration:config)
                guard let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else {throw CocoaError(.fileWriteUnknown)}
                try png.write(to:URL(fileURLWithPath:CommandLine.arguments[2]))
                print("Native WebKit snapshot saved");exit(0)
            }catch{FileHandle.standardError.write(Data(("Render failed: \(error)\n").utf8));exit(1)}
        }
    }
}
@main @MainActor enum Main {
    static func main(){let app=NSApplication.shared;app.setActivationPolicy(.accessory);let renderer=Render();renderer.start();withExtendedLifetime(renderer){app.run()}}
}
