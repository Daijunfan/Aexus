import AppKit
import SwiftUI

/// One normal, reusable window owned by the independent accessory application.
@MainActor final class ToolWindow: NSObject {
    private let window: NSWindow
    private let quit: @MainActor () -> Void
    private let supportsFullscreen: Bool

    init<Content: View>(title: String, size: NSSize, minimumSize: NSSize? = nil, supportsFullscreen: Bool = false,
                       quit: @escaping @MainActor () -> Void = { NSApp.terminate(nil) },
                       @ViewBuilder content: () -> Content) {
        self.quit = quit
        self.supportsFullscreen = supportsFullscreen
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        super.init()
        window.title = title
        window.isReleasedWhenClosed = false
        window.collectionBehavior = supportsFullscreen ? [.fullScreenPrimary] : [.moveToActiveSpace, .fullScreenAuxiliary, .canJoinAllApplications]
        window.contentMinSize = minimumSize ?? NSSize(width: min(size.width, 600), height: 440)
        window.contentView = NSHostingView(rootView: content().frame(maxWidth: .infinity, maxHeight: .infinity))
        let name = (Bundle.main.bundleIdentifier ?? title) + ".main"
        window.setFrameAutosaveName(name)
        if !window.setFrameUsingName(name) { window.center() }
        installMenus(title)
    }

    func show() {
        ToolDock.apply()
        window.collectionBehavior = supportsFullscreen ? [.fullScreenPrimary] : [.moveToActiveSpace, .fullScreenAuxiliary, .canJoinAllApplications]
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func installMenus(_ title: String) {
        let menu = NSMenu()
        let app = NSMenu(title: title)
        let exit = NSMenuItem(title: "退出 " + title, action: #selector(quitApp), keyEquivalent: "q")
        exit.target = self; app.addItem(exit)
        let appItem = NSMenuItem(); appItem.submenu = app; menu.addItem(appItem)
        let edit = NSMenu(title: "编辑")
        for (label, action, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"),
                                     ("剪切", "cut:", "x"), ("复制", "copy:", "c"),
                                     ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.addItem(withTitle: label, action: Selector(action), keyEquivalent: key)
        }
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        editItem.submenu = edit; menu.addItem(editItem)
        let windows = NSMenu(title: "窗口")
        windows.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windows.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        if supportsFullscreen {
            let fullscreen = NSMenuItem(title: "切换全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            fullscreen.keyEquivalentModifierMask = [.control, .command]
            windows.addItem(fullscreen)
        }
        let windowItem = NSMenuItem(title: "窗口", action: nil, keyEquivalent: "")
        windowItem.submenu = windows; menu.addItem(windowItem)
        NSApp.mainMenu = menu
    }

    @objc private func quitApp() { quit() }
}
