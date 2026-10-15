import AppKit

let source = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Assets/CloudHosts-generated.png")
guard let artwork = NSImage(contentsOf: source) else {fatalError("Cloud Hosts icon artwork is missing")}
let icon = NSImage(size: NSSize(width: 1024, height: 1024))
icon.lockFocus()
// Apply the standard macOS icon silhouette to the generated artwork.
NSBezierPath(roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 215, yRadius: 215).addClip()
NSGraphicsContext.current?.imageInterpolation = .high
artwork.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024))
icon.unlockFocus()
let bitmap = NSBitmapImageRep(data: icon.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
