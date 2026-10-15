import AppKit

/// Dock visibility is a user preference shared by independent Toolbox apps.
@MainActor enum ToolDock {
    private static let changed = Notification.Name("com.djf.toolbox.dock-changed")
    private static var observer: NSObjectProtocol?
    private static let file = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Toolbox/dock.json")

    static func visibleBundleIDs() -> Set<String> {
        guard let data = try? Data(contentsOf: file),
              let ids = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(ids)
    }

    static func setVisible(_ visible: Bool, for bundleID: String) throws {
        var ids = visibleBundleIDs()
        if visible { ids.insert(bundleID) } else { ids.remove(bundleID) }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(ids.sorted()).write(to: file, options: .atomic)
        DistributedNotificationCenter.default().postNotificationName(changed, object: nil, deliverImmediately: true)
    }

    static func install() {
        apply()
        guard observer == nil else { return }
        observer = DistributedNotificationCenter.default().addObserver(forName: changed, object: nil, queue: .main) { _ in
            Task { @MainActor in apply() }
        }
    }

    static func apply() {
        guard let bundleID = Bundle.main.bundleIdentifier else { return }
        NSApp.setActivationPolicy(visibleBundleIDs().contains(bundleID) ? .regular : .accessory)
    }
}
