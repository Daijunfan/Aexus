import AppKit
import WebKit

@MainActor final class ModeIntegration: NSObject, WKNavigationDelegate {
  let web=WKWebView(frame:NSRect(x:0,y:0,width:1360,height:900))
  let window=NSWindow(contentRect:NSRect(x:-2800,y:-2800,width:1360,height:900),styleMask:[],backing:.buffered,defer:false)
  let url:URL,fixture:String
  init(url:URL,fixture:String){self.url=url;self.fixture=fixture;super.init();window.contentView=web;web.navigationDelegate=self}
  func start(){web.load(URLRequest(url:url))}
  func webView(_ web:WKWebView,didFinish navigation:WKNavigation!){
    Task { @MainActor in
      do {
        let test=try String(contentsOfFile:fixture,encoding:.utf8)
        _ = try await web.evaluateJavaScript(test+";void 0")
        let result=try await web.callAsyncJavaScript("return await window.runWorkspaceModeChecks()",arguments:[:],in:nil,contentWorld:.page)
        let data=try JSONSerialization.data(withJSONObject:result as Any,options:[.prettyPrinted,.sortedKeys])
        FileHandle.standardOutput.write(data)
        exit((result as? [String:Any])?["passed"] as? Bool == true ? 0 : 1)
      } catch {
        FileHandle.standardError.write(Data(("CloudHosts live WebKit UI test failed: \(error)\n").utf8))
        exit(1)
      }
    }
  }
  func webView(_ web:WKWebView,didFail navigation:WKNavigation!,withError error:Error){
    FileHandle.standardError.write(Data(("Navigation failed: \(error)\n").utf8));exit(1)
  }
}
@main @MainActor enum CloudHostsModeUITest {
  static func main(){
    let app=NSApplication.shared;app.setActivationPolicy(.accessory)
    guard CommandLine.arguments.count==3,let url=URL(string:CommandLine.arguments[1])else{exit(2)}
    let fixture=CommandLine.arguments[2]
    let checks=ModeIntegration(url:url,fixture:fixture)
    checks.start()
    withExtendedLifetime(checks){app.run()}
  }
}
