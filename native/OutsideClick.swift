import AppKit

// Read-only mouse-down notifications. No keyboard capture, event suppression or files.
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let parent = getppid()
let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { event in
    guard let cgEvent = event.cgEvent else { return }
    let point = cgEvent.location
    var target = Int(cgEvent.getIntegerValueField(.eventTargetUnixProcessID))
    // Global NSEvents can carry the observer's PID instead of the clicked app's PID.
    if target == 0 || target == getpid(),
       let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
        for window in windows {
            guard let bounds = window[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), rect.contains(point),
                  let alpha = window[kCGWindowAlpha as String] as? Double, alpha > 0 else { continue }
            target = window[kCGWindowOwnerPID as String] as? Int ?? 0
            break
        }
    }
    let data: [String: Any] = ["x": point.x, "y": point.y, "targetPid": target]
    if let json = try? JSONSerialization.data(withJSONObject: data) {
        FileHandle.standardOutput.write(json + Data([10]))
    }
}
guard monitor != nil else { exit(1) }
// Also exit if the main app crashed, so this helper cannot become a resident service.
Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    if getppid() != parent { exit(0) }
}
application.run()
