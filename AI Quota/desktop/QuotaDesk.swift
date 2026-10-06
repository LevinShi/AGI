import AppKit
import WebKit
import UniformTypeIdentifiers
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var panel: NSWindow!
    var web: WKWebView!
    var backend: Process?
    var backendURL: URL?
    var stdoutPipe: Pipe?
    var quitting = false
    var lockFD: Int32 = -1
    var smokeStarted = false
    var smokeOutput = NSTemporaryDirectory()
    let smoke = CommandLine.arguments.contains("--smoke-test")
    let defaults = UserDefaults.standard
    var expandedSize = NSSize(width: 760, height: 720)

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let icon = Bundle.main.url(forResource: "QuotaDesk", withExtension: "icns") { NSApp.applicationIconImage = NSImage(contentsOf: icon) }
        if !smoke, let other = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "local.quota-desk").first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            other.activate(options: []); NSApp.terminate(nil); return
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "quota")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self; web.uiDelegate = self
        if let screen = NSScreen.main { expandedSize.height = min(720, screen.visibleFrame.height - 70) }
        panel = NSWindow(contentRect: NSRect(origin: .zero, size: expandedSize), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        panel.title = "Quota Desk · 账户额度"; panel.delegate = self; panel.contentView = web
        panel.isReleasedWhenClosed = false; panel.level = .normal
        panel.minSize = NSSize(width: 700, height: 450)
        panel.setFrameAutosaveName(smoke ? "QuotaSmoke" : "QuotaMainWindow")
        if !panel.setFrameUsingName(smoke ? "QuotaSmoke" : "QuotaMainWindow") { panel.center() }
        setupEditMenu(); showWindow(); startBackend()
    }
    func setupEditMenu() {
        let menu = NSMenu(), application = NSMenuItem(), editItem = NSMenuItem()
        let appMenu = NSMenu(); let show = NSMenuItem(title: "显示账户额度", action: #selector(showWindow), keyEquivalent: "1"); show.target = self; appMenu.addItem(show); appMenu.addItem(.separator()); let quit = NSMenuItem(title: "退出 Quota Desk", action: #selector(quitApp), keyEquivalent: "q"); quit.target = self; appMenu.addItem(quit)
        application.submenu = appMenu; menu.addItem(application)
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] { edit.addItem(NSMenuItem(title: title, action: NSSelectorFromString(selector), keyEquivalent: key)) }
        editItem.submenu = edit; menu.addItem(editItem)
        let windowItem = NSMenuItem(), windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(NSMenuItem(title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        windowItem.submenu = windowMenu; menu.addItem(windowItem); NSApp.windowsMenu = windowMenu; NSApp.mainMenu = menu
    }
    @objc func showWindow() {
        if panel.isMiniaturized { panel.deminiaturize(nil) }
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
    }
    @objc func hideWindow() { panel.orderOut(nil) }
    @objc func quitApp() { NSApp.terminate(nil) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { hideWindow(); return false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }

    func startBackend() {
        do {
            guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
            let config = (try? JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("runtime.json")))) as? [String: String] ?? [:]
            let bundledNode = resources.appendingPathComponent("runtime/bin/node").path
            let node = FileManager.default.isExecutableFile(atPath: bundledNode) ? bundledNode : (config["node"] ?? "")
            guard FileManager.default.isExecutableFile(atPath: node) else { throw NSError(domain: "QuotaDesk", code: 1, userInfo: [NSLocalizedDescriptionKey: "找不到本机 Node.js。请重新运行 npm run build:desktop。"] ) }
            smokeOutput = ProcessInfo.processInfo.environment["QUOTA_SMOKE_OUTPUT"] ?? config["smokeOutput"] ?? NSTemporaryDirectory()
            let directory = smoke ? URL(fileURLWithPath: config["smokeData"] ?? NSTemporaryDirectory() + "quota-desktop-smoke") : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Quota Desk", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            lockFD = Darwin.open(directory.appendingPathComponent("desktop.lock").path, O_CREAT | O_RDWR, 0o600)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else { throw NSError(domain: "QuotaDesk", code: 2, userInfo: [NSLocalizedDescriptionKey: "另一个 Quota Desk 正在使用这份记录。"] ) }
            let dataFile = directory.appendingPathComponent("quotas.json")
            if !smoke, !FileManager.default.fileExists(atPath: dataFile.path), let legacy = config["legacyData"], FileManager.default.fileExists(atPath: legacy) {
                try FileManager.default.copyItem(atPath: legacy, toPath: dataFile.path)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dataFile.path)
            }
            let process = Process(), pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: node); process.arguments = [resources.appendingPathComponent("app/src/server.mjs").path]
            var env = ProcessInfo.processInfo.environment
            env["QUOTA_PORT"] = "0"; env["QUOTA_DATA_PATH"] = dataFile.path
            if smoke { env["QUOTA_SMOKE"] = "1" }
            env["QUOTA_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
            if let codex = config["codex"] { env["QUOTA_CODEX_BIN"] = codex }
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            env["PATH"] = "\(resources.appendingPathComponent("runtime/bin").path):\(home)/.npm-global/bin:\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
            process.environment = env; process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
            process.terminationHandler = { [weak self] _ in DispatchQueue.main.async { if self?.quitting == false { self?.backendFailed("本地额度服务已停止，请退出后重新打开。记录仍保存在本机。") } } }
            self.backend = process; self.stdoutPipe = pipe
            var output = ""
            pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let bytes = handle.availableData
                guard !bytes.isEmpty else { handle.readabilityHandler = nil; return }
                output += String(data: bytes, encoding: .utf8) ?? ""
                if output.count > 4096 { output = String(output.suffix(4096)) }
                if output.contains("\n"), let line = output.components(separatedBy: "\n").first(where: { $0.hasPrefix("Quota Desk: http://127.0.0.1:") }), let url = URL(string: String(line.dropFirst("Quota Desk: ".count))) {
                    DispatchQueue.main.async { guard let self = self, self.backendURL == nil else { return }; self.backendURL = url; self.web.load(URLRequest(url: url)) }
                }
            }
            try process.run()
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in if self?.backendURL == nil && self?.quitting == false { self?.backendFailed("本地服务启动超时，请确认 Node.js 可运行，以及额度记录未损坏。") } }
        } catch { backendFailed(error.localizedDescription) }
    }
    func backendFailed(_ message: String) {
        if smoke { fputs("Desktop smoke failed: \(message)\n", stderr); NSApp.terminate(nil); return }
        web.loadHTMLString("<html><body style='font:13px -apple-system;padding:24px;color:#536c58'><h3>暂时无法读取额度</h3><p>请退出后重新打开 Quota Desk。记录未被删除。</p></body></html>", baseURL: nil)
        panel.title = "Quota Desk · 服务未连接"
    }
    func trusted(_ message: WKScriptMessage) -> Bool {
        guard let url = backendURL else { return false }
        let origin = message.frameInfo.securityOrigin
        return message.frameInfo.isMainFrame && origin.protocol == "http" && origin.host == "127.0.0.1" && origin.port == url.port
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard trusted(message), let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "hide": hideWindow()
        case "summary":
            if let count = body["attention"] as? Int, (0...40).contains(count) {
                let example = body["example"] as? Bool == true
                panel.title = example ? "Quota Desk · 示例" : "Quota Desk · 账户额度"
            }
        case "export":
            guard let json = body["json"] as? String, let data = json.data(using: .utf8), data.count <= 512 * 1024, (try? JSONSerialization.jsonObject(with: data)) != nil else { return }
            let save = NSSavePanel(); save.allowedContentTypes = [.json]; save.nameFieldStringValue = "quota-records.json"
            save.beginSheetModal(for: panel) { result in if result == .OK, let url = save.url { try? data.write(to: url, options: .atomic) } }
        default: break
        }
    }
    func isLocal(_ url: URL) -> Bool { url.scheme == "http" && url.host == "127.0.0.1" && url.port == backendURL?.port }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" { decisionHandler(.allow); return }
        if isLocal(url) && action.targetFrame?.isMainFrame == true && url.path == "/" { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && (url.scheme == "https" || (isLocal(url) && url.path == "/design")) { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { return nil }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let dialog = NSOpenPanel(); dialog.canChooseDirectories = false; dialog.allowsMultipleSelection = false; dialog.allowedContentTypes = [.json]
        dialog.beginSheetModal(for: panel) { response in completionHandler(response == .OK ? dialog.urls : nil) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        web.evaluateJavaScript("window.quotaDesktopState?.({compact:false})", completionHandler: nil)
        if smoke && !smokeStarted { smokeStarted = true; runSmoke(attempt: 0) }
    }
    func runSmoke(attempt: Int) {
        web.evaluateJavaScript("document.querySelectorAll('#accountRows tr').length") { [weak self] value, error in
            guard let self = self else { return }
            if value as? Int != 8 {
                if attempt < 30 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.runSmoke(attempt: attempt + 1) } }
                else { fputs("Desktop smoke failed: rows did not load\n", stderr); self.quitApp() }
                return
            }
            self.web.evaluateJavaScript("document.getElementById('demoButton').click(); true") { _, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.captureSmoke() }
            }
        }
    }
    func captureSmoke() {
        let output = smokeOutput
        web.takeSnapshot(with: nil) { [weak self] image, error in
            guard let self = self else { return }
            if let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: output).appendingPathComponent("desktop-webview.png")) }
            let report: [String: Any] = ["rows": 8, "regularApp": NSApp.activationPolicy() == .regular, "normalWindow": self.panel.level == .normal, "titled": self.panel.styleMask.contains(.titled), "resizable": self.panel.styleMask.contains(.resizable), "miniaturizable": self.panel.styleMask.contains(.miniaturizable), "screenshot": error == nil]
            self.panel.miniaturize(nil)
            self.finishWindowSmoke(report, attempt: 0)
        }
    }
    func finishWindowSmoke(_ initial: [String: Any], attempt: Int) {
        if !panel.isMiniaturized && attempt < 30 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.finishWindowSmoke(initial, attempt: attempt + 1) }
            return
        }
        var report = initial
        report["minimized"] = panel.isMiniaturized
        showWindow()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            report["restoredFromDock"] = self.panel.isVisible && !self.panel.isMiniaturized
            _ = self.windowShouldClose(self.panel); report["closedWithoutQuitting"] = !self.panel.isVisible
            _ = self.applicationShouldHandleReopen(NSApp, hasVisibleWindows: false); report["reopened"] = self.panel.isVisible
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: URL(fileURLWithPath: self.smokeOutput).appendingPathComponent("desktop-smoke.json")) }
            print("Desktop smoke complete")
            self.quitApp()
        }
    }
    func applicationWillTerminate(_ notification: Notification) {
        quitting = true; stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        if backend?.isRunning == true { backend?.terminate() }
        if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD) }
    }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
