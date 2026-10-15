// Native macOS WKWebView authentication lifecycle harness.
//
// Everything runs in a real WKWebView inside a real, disk-backed
// WKWebsiteDataStore, so what is exercised is the actual native cookie jar and
// the actual native frame lifecycle — not a Chromium approximation.
//
// Usage: webkit-auth-lifecycle <urlA> <urlB> <driver.js> <storeUUID> <cold|retained> <out.json> [clientId]
//   urlA  CloudHosts shell URL of the first localhost Core instance
//   urlB  CloudHosts shell URL of a second, independent localhost instance
//   cold  start with an empty native cookie store and run the full journey
//   retained
//         a brand new process that must start from the cookies the cold run left
//         on disk, proving real retained-cookie startup rather than in-memory state
//   clientId
//         the browser client id the cold run used. A CloudHosts window keeps its
//         client id for its whole session (ui/aexus-embed.js getClient), and the
//         Core scopes the session cookie to that client, so a restored window must
//         present it again. Passing it re-creates that window identity; the harness
//         never creates, edits or replays a cookie — the one the native store kept
//         is simply presented again for real.
import AppKit
import WebKit
import CryptoKit

struct HarnessFailure: Error { let message: String }

@MainActor final class AuthLifecycleHarness: NSObject, WKScriptMessageHandler {
  private let driver: String
  private let urlA: URL
  private let urlB: URL
  private let phase: String
  private let storeIdentifier: String
  private let store: WKWebsiteDataStore
  private let startedAt = Date()
  // Provenance: which backend and build this native verdict covers. Read from the
  // environment so the verdict JSON self-identifies the candidate it tested instead
  // of requiring a timestamp correlation to a build.
  private let backendPath: String
  private let buildId: String
  private let version: String

  private var windows: [NSWindow] = []
  private var views: [WKWebView] = []
  private var tagOf: [ObjectIdentifier: Int] = [:]
  private var readyCounts: [Int: Int] = [:]
  private var httpRecords: [[String: Any]] = []
  private var frameReports: [[String: Any]] = []
  private var pageErrors: [String] = []
  private var shellSegments: [[String: Any]] = []
  private var frameNavigations: [String] = []
  private var frameStates: [[String: Any]] = []
  private var frameMessages: [String] = []
  private var probes: [String] = []
  private var bootstraps: [[String: Any]] = []
  // Documents that received a host view navigation without presenting it. Each is
  // a product failure: the frame's own throw fails the phase, and this list is the
  // evidence of what was received versus what was presented.
  private var navigationMismatches: [[String: Any]] = []
  private let retainedClientId: String?

  init(driver: String, urlA: URL, urlB: URL, phase: String, storeIdentifier: String, retainedClientId: String? = nil) {
    let env = ProcessInfo.processInfo.environment
    self.backendPath = env["AEXUS_TEST_BACKEND"] ?? ""
    self.buildId = env["AEXUS_TEST_BUILD_ID"] ?? ""
    self.version = env["AEXUS_TEST_VERSION"] ?? ""
    self.retainedClientId = retainedClientId
    self.driver = driver
    self.urlA = urlA
    self.urlB = urlB
    self.phase = phase
    self.storeIdentifier = storeIdentifier
    if #available(macOS 14.0, *), let identifier = UUID(uuidString: storeIdentifier) {
      self.store = WKWebsiteDataStore(forIdentifier: identifier)
    } else {
      fatalError("The auth harness requires macOS 14 and an isolated store UUID")
    }
    super.init()
  }

  // MARK: - WebKit plumbing

  private func makeView(tag: Int) -> WKWebView {
    let controller = WKUserContentController()
    // Registered before the driver so the window identity is in place before any
    // product script reads it. Only the restored window carries the previous
    // session's identity: a second window of a real browser is a new client, and
    // the harness must not blur that distinction.
    if let retainedClientId, tag == 1 {
      controller.addUserScript(WKUserScript(
        source: "window.__aexusRetainedClientId = \(jsonString(retainedClientId));",
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    controller.addUserScript(WKUserScript(source: driver, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    controller.add(self, name: "aexusAuth")
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = store
    configuration.userContentController = controller
    // An offscreen page counts as not visible, and WebKit may then *suspend* its
    // WebContent page: every task source in it stops — timers, message channels and
    // a pending `await` alike — with no error and no way for the page to notice. A
    // real user's Role Board runs in a visible window and never meets this, so the
    // suppression is turned off here rather than being mistaken for product
    // behaviour. It changes no product source and suppresses no refusal: requests,
    // status codes and errors are still reported exactly as the product produces
    // them. `_setPageVisibilityBasedProcessSuppressionEnabled:` is an SPI whose
    // setter is present on this WebKit; it is called through its implementation so
    // the BOOL argument is passed as a BOOL and not as an object.
    let suppressionSelector = NSSelectorFromString("_setPageVisibilityBasedProcessSuppressionEnabled:")
    if let method = class_getInstanceMethod(WKPreferences.self, suppressionSelector) {
      typealias SuppressionSetter = @convention(c) (NSObject, Selector, Bool) -> Void
      unsafeBitCast(method_getImplementation(method), to: SuppressionSetter.self)(
        configuration.preferences, suppressionSelector, false)
    }
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 1000), configuration: configuration)
    view.setValue(false, forKey: "drawsBackground")
    let window = NSWindow(contentRect: NSRect(x: -2800, y: -2800, width: 1440, height: 1000), styleMask: [], backing: .buffered, defer: false)
    window.contentView = view
    // A real user's Role Board runs in an ordered window, so the harness orders its
    // window too — offscreen, never activated, never brought to the user's attention.
    window.orderFrontRegardless()
    windows.append(window)
    views.append(view)
    tagOf[ObjectIdentifier(view)] = tag
    readyCounts[tag] = 0
    return view
  }

  nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    MainActor.assumeIsolated {
      guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
      switch kind {
      case "ready":
        if let view = message.webView, let tag = tagOf[ObjectIdentifier(view)] { readyCounts[tag, default: 0] += 1 }
      case "http":
        httpRecords.append(body)
        let status = (body["status"] as? Int) ?? 0
        let path = (body["path"] as? String) ?? "?"
        let frame = (body["frame"] as? String) ?? "?"
        let detail = (body["body"] as? String) ?? ""
        let sent = (body["request"] as? String) ?? ""
        note("[\(frame)] refused \(status) \(path) \(detail) << \(sent)")
      case "frame":
        frameReports.append(body)
      case "frame-error":
        frameReports.append(body)
      case "error":
        pageErrors.append((body["message"] as? String) ?? "unknown")
      case "progress":
        note("[\((body["frame"] as? String) ?? "?")] \((body["step"] as? String) ?? "?") \((body["detail"] as? String) ?? "")")
      case "segment":
        shellSegments.append(body)
      // Every `/api/bootstrap` answer, so the cold path and the retained-cookie
      // path are both positive evidence instead of the absence of an error.
      case "bootstrap":
        bootstraps.append(["status": (body["status"] as? Int) ?? 0, "client": (body["client"] as? String) ?? "",
                           "origin": (body["origin"] as? String) ?? "",
                           "frame": (body["frame"] as? String) ?? "?", "at": Int(Date().timeIntervalSince(self.startedAt) * 1000)])
        note("[\((body["frame"] as? String) ?? "?")] bootstrap \(body["status"] ?? "?") client=\((body["client"] as? String) ?? "-") origin=\((body["origin"] as? String) ?? "-")")
      // The frame reports these synchronously with the event, so they arrive even
      // when the document's own timer queue has stopped running.
      case "frame-message":
        let type = (body["type"] as? String) ?? "?"
        frameMessages.append(type)
        note("[core] frame-message \(type)")
      case "frame-navigation":
        let view = (body["view"] as? String) ?? "?"
        frameNavigations.append(view)
        note("[core] frame-navigation \(view)")
      case "frame-state":
        let detail = (body["detail"] as? String) ?? "{}"
        frameStates.append(["detail": detail, "index": frameReports.count])
        note("[core] frame-state \(detail)")
      // The frame's own report that a host navigation it received did not change the
      // view it presents. That is a product failure, not a condition to compensate
      // for: the harness records the received navigations and the view the frame is
      // stuck on, then the frame's own throw fails the phase. It is never re-issued
      // into a pass.
      case "frame-nav-mismatch":
        let seen = (body["navigation"] as? [String]) ?? []
        navigationMismatches.append(["view": (body["view"] as? String) ?? "-",
                                     "navigation": seen,
                                     "at": Int(Date().timeIntervalSince(self.startedAt) * 1000)])
        note("[core] frame-nav-mismatch: host navigations \(seen) left the frame on \(body["view"] ?? "-")")
      case "probe":
        let step = (body["step"] as? String) ?? "?"
        probes.append(step)
        note("[core] probe \(step)")
      default:
        break
      }
    }
  }

  private func note(_ text: String) {
    let elapsed = Int(Date().timeIntervalSince(self.startedAt) * 1000)
    FileHandle.standardError.write(Data("[+\(elapsed)ms] \(text)\n".utf8))
  }

  private func jsonString(_ value: String) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: [value])) ?? Data("[\"\"]".utf8)
    let text = String(decoding: data, as: UTF8.self)
    return String(text.dropFirst().dropLast())
  }

  // The session cookie the Core scopes to one browser client:
  // `agents_company_session_<corePort>_<sha256(clientId) first 12 hex>`
  // (AgentBoard/Aexus/src/main/web/auth.ts cookieName). The client half is enough
  // to recognise a window's own retained cookie whatever port the Core took.
  private func sessionCookieSuffix(_ clientId: String) -> String {
    let digest = SHA256.hash(data: Data(clientId.utf8)).map { String(format: "%02x", $0) }.joined()
    return String(digest.prefix(12))
  }

  private func isSessionCookie(_ cookie: HTTPCookie, for clientId: String) -> Bool {
    cookie.name.hasPrefix("agents_company_session_") && cookie.name.hasSuffix("_" + sessionCookieSuffix(clientId))
  }

  private func waitUntil(_ description: String, timeout: Double, _ predicate: () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if predicate() { return }
      try await Task.sleep(nanoseconds: 80_000_000)
    }
    throw HarnessFailure(message: "timed out waiting for " + description)
  }

  private func load(_ view: WKWebView, _ url: URL) async throws {
    guard let tag = tagOf[ObjectIdentifier(view)] else { throw HarnessFailure(message: "untracked view") }
    let baseline = readyCounts[tag] ?? 0
    view.load(URLRequest(url: url))
    try await waitUntil("the native shell driver in window \(tag)", timeout: 90) { (self.readyCounts[tag] ?? 0) > baseline }
  }

  @discardableResult
  private func segment(_ view: WKWebView, _ name: String) async throws -> [String: Any] {
    do {
      let value = try await view.callAsyncJavaScript("return await window.__aexusAuth.segment(name)", arguments: ["name": name], in: nil, contentWorld: .page)
      return (value as? [String: Any]) ?? [:]
    } catch {
      throw HarnessFailure(message: "segment \(name) failed: \(error.localizedDescription)")
    }
  }

  private func nextFrameReport(after index: Int, timeout: Double) async throws -> [String: Any] {
    do {
      try await waitUntil("the hosted Core frame to finish its real write", timeout: timeout) { self.frameReports.count > index }
    } catch {
      // A silent frame must be reported with the state it was last seen in, so a
      // missing write is never just "something timed out".
      let state = (frameStates.last?["detail"] as? String) ?? "none"
      throw HarnessFailure(message: "the hosted Core frame never reported its write within \(Int(timeout))s; host messages seen=\(frameMessages.suffix(8)); last frame state=\(state)")
    }
    let report = frameReports[index]
    if let message = report["message"] as? String { throw HarnessFailure(message: "hosted frame failed: " + message) }
    return report
  }

  private func allCookies() async -> [HTTPCookie] {
    await withCheckedContinuation { continuation in
      store.httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
    }
  }

  // A census must never be able to hold up the verdict: if the native store does
  // not answer, the run still reports what it proved and says the census timed out
  // rather than pretending the jar was empty.
  private func cookies(before seconds: Double) async -> [HTTPCookie]? {
    await withTaskGroup(of: [HTTPCookie]?.self) { group in
      group.addTask { await self.allCookies() }
      group.addTask { try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)); return nil }
      let first = await group.next() ?? nil
      group.cancelAll()
      return first
    }
  }

  // MARK: - Journey

  func run() async -> [String: Any] {
    var checks: [[String: Any]] = []
    func check(_ name: String, _ passed: Bool, _ detail: String = "") {
      checks.append(["name": name, "passed": passed, "detail": detail])
    }
    var fatal: String? = nil
    var startupCookies: [[String: Any]] = []
    var closingCookies: [[String: Any]] = []

    // The hosted Core's own acknowledgements of the host tab changes, recorded by
    // this process as they arrive, so the evidence is what the frame received
    // rather than what the shell believes it sent.
    func tabSwitches(_ view: WKWebView, _ name: String, _ subject: String) async throws {
      let since = frameNavigations.count
      let tabs = try await segment(view, "tabs")
      let received = Array(frameNavigations.dropFirst(since))
      check(name,
            (tabs["views"] as? [String]) == ["company", "messages", "plan"]
              && (tabs["hostAcknowledged"] as? Bool == true)
              && received == ["company", "messages", "plan"],
            "\(subject)coreReceived=\(received)")
    }

    do {
      // Native cookie store state before any page is loaded. A store created for an
      // identifier answers an empty jar until a page actually uses it: a two-process
      // probe of this exact environment showed `setCookie` + 6s writing
      // `Cookies.binarycookies`, a new process reading 0 cookies, and that same
      // process reading the cookie back as soon as it loaded a page in the store.
      // The census is recorded as an observation for that reason, and the
      // retained-cookie evidence is read once the store is genuinely in use.
      let initial = await allCookies()
      startupCookies = initial.map { ["name": $0.name, "domain": $0.domain, "path": $0.path, "secure": $0.isSecure, "sessionOnly": $0.isSessionOnly, "httpOnly": $0.isHTTPOnly] }
      // The cold process must start from a store that holds nothing of Aexus. The
      // retained process is asserted where the evidence really exists — on the
      // cookie the jar holds once it is in use, and on the first bootstrap the
      // Core answers — because its pre-load census is empty by platform design.
      if phase == "cold" {
        check("The cold process starts from an empty native cookie store, with no Aexus session cookie",
              !initial.contains { $0.name.hasPrefix("agents_company_session") }, "cookies=\(initial.count)")
      }

      let first = makeView(tag: 1)
      try await load(first, urlA)
      var reportIndex = frameReports.count
      var opened = try await segment(first, "open")
      let created = try await nextFrameReport(after: reportIndex, timeout: 240)
      check(phase == "cold"
              ? "Native cold start authorizes the hosted frame and creates a Team through the real form"
              : "The retained native process authorizes the hosted frame from the cookie on disk and creates a Team through the real form",
            (opened["ready"] as? Bool == true) && (created["teamsCreated"] as? Bool == true),
            "teams=\((created["teams"] as? [String]) ?? [])")
      // The cookie evidence itself: the store has now been used for a real page, so
      // the jar is loaded and shows what the next process will read off disk. The
      // harness never writes it — only reports that the real Core set it.
      if let client = opened["clientId"] as? String {
        let jar = await allCookies()
        check(phase == "cold"
                ? "The cold process leaves its client-scoped session cookie in the native jar"
                : "The retained native jar still holds the session cookie the cold process left for this client",
              jar.contains { isSessionCookie($0, for: client) },
              "client=\(client) jar=\(jar.map(\.name).joined(separator: ","))")
        if phase == "retained", let retainedClientId {
          check("The retained window really is the previous session's client, not a fresh one",
                client == retainedClientId, "window=\(client) expected=\(retainedClientId)")
        }
      }
      try await tabSwitches(first, "Native Role Board switches Company, Messages and Plan and the hosted Core receives each change", "")

      for iteration in 1...2 {
        // Real re-entry: leave Role Board for the native Agent Board and come back.
        reportIndex = frameReports.count
        let cycled = try await segment(first, "cycle")
        let afterCycle = try await nextFrameReport(after: reportIndex, timeout: 240)
        check("Native re-entry \(iteration) keeps the retained session writable and detaches the previous frame",
              (afterCycle["teamsCreated"] as? Bool == true) && (cycled["agentBoardDetachedFrame"] as? Bool == true),
              "teams=\((afterCycle["teams"] as? [String]) ?? [])")
        try await tabSwitches(first, "Native re-entry \(iteration) still navigates Company, Messages and Plan", "re-entry\(iteration) ")

        // Real window reload with the same native cookie jar.
        reportIndex = frameReports.count
        let tag = tagOf[ObjectIdentifier(first)]!
        let baseline = readyCounts[tag] ?? 0
        first.reload()
        try await waitUntil("window 1 driver after reload", timeout: 90) { (self.readyCounts[tag] ?? 0) > baseline }
        let afterReload = try await segment(first, "open")
        let reloaded = try await nextFrameReport(after: reportIndex, timeout: 240)
        check("Native window reload \(iteration) re-authorizes from retained cookies and writes again",
              (afterReload["ready"] as? Bool == true) && (reloaded["teamsCreated"] as? Bool == true),
              "teams=\((reloaded["teams"] as? [String]) ?? [])")
        try await tabSwitches(first, "Native window reload \(iteration) still navigates Company, Messages and Plan", "reload\(iteration) ")
      }

      reportIndex = frameReports.count
      opened = try await segment(first, "single")
      let afterSingle = try await nextFrameReport(after: reportIndex, timeout: 240)
      check("Native Single Host Role subpage round-trips back into an authorized Role Board",
            (opened["ready"] as? Bool == true) && (afterSingle["teamsCreated"] as? Bool == true), "")

      let instanceAId = opened["instanceId"] as? String
      let firstWindowTeams = (afterSingle["teams"] as? [String]) ?? []
      let firstWindowGroups = (afterSingle["groups"] as? [String]) ?? []

      // A second browser window in the same native cookie storage.
      let second = makeView(tag: 2)
      try await load(second, urlA)
      reportIndex = frameReports.count
      let secondOpened = try await segment(second, "open")
      let secondReport = try await nextFrameReport(after: reportIndex, timeout: 240)
      check("A second native WKWebView on the same WKWebsiteDataStore is authorized without replacing the first window session",
            (secondOpened["ready"] as? Bool == true) && (secondOpened["instanceId"] as? String) == instanceAId
              && (secondReport["teamsCreated"] as? Bool == true),
            "instance=\(secondOpened["instanceId"] as? String ?? "nil")")
      try await tabSwitches(second, "The second window also navigates Company, Messages and Plan", "secondWindow ")

      // A second, independent localhost Core instance in the same cookie jar.
      let third = makeView(tag: 3)
      try await load(third, urlB)
      reportIndex = frameReports.count
      let thirdOpened = try await segment(third, "open")
      let thirdReport = try await nextFrameReport(after: reportIndex, timeout: 240)
      let thirdGroups = (thirdReport["groups"] as? [String]) ?? []
      check("A second localhost Core instance in the same native cookie jar authenticates separately",
            (thirdOpened["ready"] as? Bool == true) && (thirdReport["teamsCreated"] as? Bool == true)
              && (thirdOpened["instanceId"] as? String) != instanceAId,
            "instance=\(thirdOpened["instanceId"] as? String ?? "nil")")
      check("The second Core instance never sees the first instance's Teams",
            !thirdGroups.contains(where: { firstWindowTeams.contains($0) }),
            "secondCoreGroups=\(thirdGroups)")

      // The first window must still be authorized and writable afterwards.
      reportIndex = frameReports.count
      _ = try await segment(first, "cycle")
      let recovered = try await nextFrameReport(after: reportIndex, timeout: 240)
      check("After the second Core instance was used, the first window still writes on its own retained session",
            (recovered["teamsCreated"] as? Bool == true), "firstWindowGroupsBefore=\(firstWindowGroups.count)")

      fatal = nil
    } catch {
      fatal = (error as? HarnessFailure)?.message ?? error.localizedDescription
    }

    // Strict: no request may be refused. A 403 Invalid CSRF token, a rejected or
    // otherwise refused mutation is a failure, never a tolerated condition.
    //
    // The single exception is the designed cold path: the hosted Core is probed
    // with an unauthenticated `/api/bootstrap` before the host handshake issues a
    // session, and that probe answers 401. It is counted and reported separately.
    let isPreAuthProbe: ([String: Any]) -> Bool = { record in
      (record["status"] as? Int) == 401 && (record["path"] as? String) == "/api/bootstrap"
    }
    let refused = httpRecords.filter { record in
      ((record["status"] as? Int) ?? 0) >= 400 || (record["rejected"] as? Bool) == true
    }
    let preAuthProbes = refused.filter(isPreAuthProbe)
    let authFailures = refused.filter { record in
      if isPreAuthProbe(record) { return false }
      let status = (record["status"] as? Int) ?? 0
      return status >= 400 || (record["rejected"] as? Bool) == true
    }
    check("No authenticated request was refused by the Core during the whole native lifecycle",
          authFailures.isEmpty, "refused=\(authFailures.count) preAuthBootstrapProbes=\(preAuthProbes.count)")
    check("No JavaScript error or unhandled rejection in the native shell or the hosted Core frame",
          pageErrors.isEmpty, pageErrors.prefix(3).joined(separator: " | "))

    // Every document that was asked to present Company did present it and write. A
    // document that received a host navigation but did not present it throws, so it
    // is a frame-error (never a counted document) and the phase fails; the
    // navigationMismatches list records what was received versus what was presented.
    let documents = frameReports.filter { $0["message"] == nil }
    let unrecovered = documents.filter { ($0["teamsCreated"] as? Bool) != true }
    check("Every host view navigation reached a document that presents and writes on it",
          !documents.isEmpty && documents.count == frameReports.count && unrecovered.isEmpty && navigationMismatches.isEmpty,
          "wrote=\(documents.count - unrecovered.count)/\(frameReports.count) mismatches=\(navigationMismatches.count)")

    // The designed cold path answers the pre-handshake bootstrap with 401; a window
    // whose retained cookie is honored answers it with 200 and never builds its
    // session from scratch. Both are asserted, so neither can hide behind the other.
    // Later windows in the same process are *new* browser clients (the CloudHosts
    // shell gives every window its own client id), so their cold 401 is the same
    // designed path; only the retained client's own probes are strictly forbidden.
    let coreBootstraps = bootstraps.filter { ($0["frame"] as? String) == "core" }
    let bootstrapStatuses = coreBootstraps.map { ($0["status"] as? Int) ?? 0 }
    if phase == "cold" {
      check("The cold process meets the designed unauthenticated bootstrap probe before the host authorizes it",
            bootstrapStatuses.first == 401, "coreBootstraps=\(bootstrapStatuses)")
    } else {
      // The instance the retained cookie belongs to is the one the first frame
      // document was served from. A different localhost Core is a different origin
      // with its own cookie scope, so its cold probe is the designed path — the
      // claim being proved is that on *its own* instance the restored window is
      // never asked to authenticate again.
      let retainedOrigin = coreBootstraps.first?["origin"] as? String
      let ownInstance = coreBootstraps.filter {
        ($0["origin"] as? String) == retainedOrigin && ($0["client"] as? String) == retainedClientId
      }
      let notAuthorized = ownInstance.filter { (($0["status"] as? Int) ?? 0) != 200 }
      check("The retained process is authorized by the cookie the native store kept, on its own Core instance, with no login and no unauthenticated probe",
            bootstrapStatuses.first == 200 && !ownInstance.isEmpty && notAuthorized.isEmpty,
            "origin=\(retainedOrigin ?? "-") client=\(retainedClientId ?? "-") ownInstanceBootstraps=\(ownInstance.count) notOk=\(notAuthorized.map { ($0["status"] as? Int) ?? 0 }) allStatuses=\(bootstrapStatuses)")
    }

    // What this process itself holds when it ends. If the next process starts
    // empty, that is a persistence fact about the native store, not an
    // authorization failure, and the two must not be confused.
    let closing = await cookies(before: 15)
    closingCookies = (closing ?? []).map { ["name": $0.name, "domain": $0.domain, "isSessionOnly": $0.isSessionOnly] }

    let passed = fatal == nil && checks.allSatisfy { ($0["passed"] as? Bool) == true }
    var result: [String: Any] = [
      "passed": passed,
      "phase": phase,
      "storeIdentifier": storeIdentifier,
      "backend": backendPath,
      "version": version,
      "buildId": buildId,
      "checks": checks,
      "startupCookies": startupCookies,
      "closingCookies": closingCookies,
      "frameReports": frameReports,
      "refusedRequests": authFailures,
      "preAuthBootstrapProbes": preAuthProbes,
      "shellSegments": shellSegments,
      "bootstraps": bootstraps,
      "retainedClientId": retainedClientId ?? "",
      "frameNavigations": frameNavigations,
      "frameStates": frameStates,
      "frameMessages": frameMessages,
      "probes": probes,
      "pageErrors": pageErrors,
      // Product-side failures, reported and failed rather than compensated: a
      // document that received a host view navigation and did not present it.
      "navigationMismatches": navigationMismatches,
      // Only refused or rejected responses are posted by the driver, so this is a
      // count of refusal records, not of requests. Every `/api/` request a frame
      // made is reported by that frame as `apiRequests`.
      "refusedHttpRecords": httpRecords.count
    ]
    if let fatal { result["error"] = fatal }
    return result
  }
}

@main @MainActor enum WebKitAuthLifecycle {
  static func main() {
    let arguments = CommandLine.arguments
    guard #available(macOS 14.0, *) else {
      FileHandle.standardError.write(Data("The auth harness requires macOS 14 isolated data stores\n".utf8)); exit(2)
    }
    // A fresh process with this harness's executable identity releases the exact
    // store after both phases exit. WebKit requires all using views to be gone.
    if arguments.count == 3, arguments[1] == "--cleanup-store", let identifier = UUID(uuidString: arguments[2]) {
      let app = NSApplication.shared
      app.setActivationPolicy(.accessory)
      // Initialize WebKit on the main thread before its asynchronous removal IO.
      // No WKWebView uses this exact test store in the cleanup process.
      _ = WKWebsiteDataStore(forIdentifier: identifier)
      WKWebsiteDataStore.remove(forIdentifier: identifier) { error in
        if let error { FileHandle.standardError.write(Data("store cleanup failed: \(error)\n".utf8)); exit(1) }
        exit(0)
      }
      app.run()
      return
    }
    guard arguments.count == 7 || arguments.count == 8,
          let urlA = URL(string: arguments[1]),
          let urlB = URL(string: arguments[2]) else {
      FileHandle.standardError.write(Data("usage: webkit-auth-lifecycle <urlA> <urlB> <driver.js> <storeUUID> <cold|retained> <out.json> [clientId]\n".utf8))
      exit(2)
    }
    let driverPath = arguments[3], storeIdentifier = arguments[4], phase = arguments[5], outPath = arguments[6]
    let retainedClientId = arguments.count == 8 ? arguments[7] : nil
    guard UUID(uuidString: storeIdentifier) != nil else {
      FileHandle.standardError.write(Data("isolated store UUID required\n".utf8)); exit(2)
    }
    guard let driver = try? String(contentsOfFile: driverPath, encoding: .utf8) else {
      FileHandle.standardError.write(Data("driver script unreadable: \(driverPath)\n".utf8)); exit(2)
    }
    guard phase == "cold" || phase == "retained" else {
      FileHandle.standardError.write(Data("phase must be cold or retained\n".utf8)); exit(2)
    }
    guard phase == "cold" || retainedClientId != nil else {
      FileHandle.standardError.write(Data("the retained phase needs the browser client id the cold run used\n".utf8)); exit(2)
    }
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let harness = AuthLifecycleHarness(driver: driver, urlA: urlA, urlB: urlB, phase: phase, storeIdentifier: storeIdentifier, retainedClientId: retainedClientId)
    Task { @MainActor in
      let result = await harness.run()
      do {
        let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: URL(fileURLWithPath: outPath))
        FileHandle.standardOutput.write(data)
      } catch {
        FileHandle.standardError.write(Data("unable to write \(outPath): \(error)\n".utf8))
        exit(3)
      }
      // Let the native cookie store reach disk before a retained-phase process reads it.
      if phase == "cold" { try? await Task.sleep(nanoseconds: 2_000_000_000) }
      exit((result["passed"] as? Bool) == true ? 0 : 1)
    }
    withExtendedLifetime(harness) { app.run() }
  }
}
