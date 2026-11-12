// raise-window: bring one window of an app to the front, even if it is on another desktop (Space).
// Usage: raise-window <bundle-id> <title-substring>
// focus-tab.js gives the window a unique temporary name first, so the title match is exact.
// System Events only sees windows on the current Space, so this builds an AX element for
// every window of the app (the remote-token trick AltTab uses), raises the match, and
// switches to its Space the way AltTab does (_SLPSSetFrontProcessWithOptions + key events).
import Cocoa
import ApplicationServices

@_silgen_name("_AXUIElementCreateWithRemoteToken")
func _AXUIElementCreateWithRemoteToken(_ data: CFData) -> Unmanaged<AXUIElement>?
@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ el: AXUIElement, _ wid: UnsafeMutablePointer<CGWindowID>) -> AXError
@_silgen_name("_SLPSSetFrontProcessWithOptions")
func _SLPSSetFrontProcessWithOptions(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ wid: CGWindowID, _ mode: UInt32) -> CGError
@_silgen_name("SLPSPostEventRecordTo")
func SLPSPostEventRecordTo(_ psn: UnsafeMutablePointer<ProcessSerialNumber>, _ bytes: UnsafeMutablePointer<UInt8>) -> CGError
@_silgen_name("GetProcessForPID")
func GetProcessForPID(_ pid: pid_t, _ psn: UnsafeMutablePointer<ProcessSerialNumber>) -> OSStatus

func attr(_ el: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

let a = CommandLine.arguments
guard a.count == 3, let app = NSRunningApplication.runningApplications(withBundleIdentifier: a[1]).first else {
  FileHandle.standardError.write("usage: raise-window <bundle-id> <title-substring>\n".data(using: .utf8)!)
  exit(2)
}
let title = a[2]
let pid = app.processIdentifier
func titleMatches(_ el: AXUIElement) -> Bool { (attr(el, kAXTitleAttribute) as? String)?.contains(title) == true }

// Element ids where this app's windows were found before. Ids only grow while the app runs,
// so checking these first (and scanning just past them) avoids a long brute-force scan.
let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
  .appendingPathComponent("com.noahriley.browser-tabs")
let cacheFile = cacheDir.appendingPathComponent("\(a[1])-\(pid).ids")
var knownIds = Set(((try? String(contentsOf: cacheFile, encoding: .utf8)) ?? "")
  .split(separator: "\n").compactMap { UInt64($0) })

var token = Data(count: 20)
token.replaceSubrange(0..<4, with: withUnsafeBytes(of: pid) { Data($0) })
token.replaceSubrange(8..<12, with: withUnsafeBytes(of: Int32(0x636f636f)) { Data($0) })
func window(_ id: UInt64) -> AXUIElement? {
  token.replaceSubrange(12..<20, with: withUnsafeBytes(of: id) { Data($0) })
  guard let el = _AXUIElementCreateWithRemoteToken(token as CFData)?.takeRetainedValue(),
        (attr(el, kAXSubroleAttribute) as? String) == "AXStandardWindow" else { return nil }
  return el
}

func quickFind() -> AXUIElement? {
  // Windows on the current Space, then windows seen on earlier runs.
  if let el = ((attr(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement]) ?? []).first(where: titleMatches) {
    return el
  }
  return knownIds.sorted().lazy.compactMap(window).first(where: titleMatches)
}

func scan() -> AXUIElement? {
  for id in UInt64(0)..<200_000 where !knownIds.contains(id) {
    guard let el = window(id) else { continue }
    knownIds.insert(id)
    if titleMatches(el) { return el }
  }
  return nil
}

// The renamed title can take a moment to reach AX, so retry the cheap lookups briefly.
var target: AXUIElement? = nil
for _ in 0..<6 {
  target = quickFind()
  if target != nil { break }
  usleep(50_000)
}
if target == nil { target = scan() }
try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
try? knownIds.sorted().map(String.init).joined(separator: "\n").write(to: cacheFile, atomically: true, encoding: .utf8)

guard let target else { print("not-found"); app.activate(); exit(1) }

if (attr(target, kAXMinimizedAttribute) as? Bool) == true {
  AXUIElementSetAttributeValue(target, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
}
// Front the process with this window as key (switches to the window's Space), make it key, then raise.
var wid: CGWindowID = 0
_ = _AXUIElementGetWindow(target, &wid)
var psn = ProcessSerialNumber()
_ = GetProcessForPID(pid, &psn)
_ = _SLPSSetFrontProcessWithOptions(&psn, wid, 0x200)  // kCPSUserGenerated
var bytes = [UInt8](repeating: 0, count: 0xf8)
bytes[0x04] = 0xf8; bytes[0x3a] = 0x10
withUnsafeBytes(of: wid) { for i in 0..<4 { bytes[0x3c + i] = $0[i] } }
for i in 0x20..<0x30 { bytes[i] = 0xff }
bytes[0x08] = 0x01; _ = SLPSPostEventRecordTo(&psn, &bytes)
bytes[0x08] = 0x02; _ = SLPSPostEventRecordTo(&psn, &bytes)
AXUIElementSetAttributeValue(target, kAXMainAttribute as CFString, kCFBooleanTrue)
AXUIElementPerformAction(target, kAXRaiseAction as CFString)
print("raised")
