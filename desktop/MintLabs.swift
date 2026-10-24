import Cocoa
import WebKit

// Native window around the local agent app. Starts agent/server.mjs if nothing is listening on the port,
// and stops only the server it started when the app quits.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?
    let port = Int(ProcessInfo.processInfo.environment["AGENT_PORT"] ?? "") ?? 3200
    var base: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    var repo: String {
        ProcessInfo.processInfo.environment["MINT_LABS_REPO"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "MintLabsRepo") as? String)
            ?? NSHomeDirectory() + "/Development/ugc-campaign-studio"
    }
    var logURL: URL {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Mint Labs")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("agent.log")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.underPageBackgroundColor = NSColor(red: 13/255, green: 16/255, blue: 24/255, alpha: 1)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Mint Labs"
        window.appearance = NSAppearance(named: .darkAqua)
        window.titlebarAppearsTransparent = true
        window.backgroundColor = webView.underPageBackgroundColor
        window.contentView = webView
        window.minSize = NSSize(width: 900, height: 600)
        window.center()
        window.setFrameAutosaveName("MintLabsMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        showMessage("Starting Mint Labs", detail: "Connecting to the agent on port \(port).")
        reachable { up in if up { self.webView.load(URLRequest(url: self.base)) } else { self.startServer() } }
    }

    func startServer() {
        guard let node = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            return showMessage("Node is not installed", detail: "Install Node 22.13 or newer with Homebrew, then reopen Mint Labs.")
        }
        let agentDir = repo + "/agent"
        guard FileManager.default.fileExists(atPath: agentDir + "/server.mjs") else {
            return showMessage("Project not found", detail: "Expected the agent at \(agentDir).")
        }
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        let log = try? FileHandle(forWritingTo: logURL)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = ["--env-file-if-exists=\(repo)/.env.local", "server.mjs"]
        p.currentDirectoryURL = URL(fileURLWithPath: agentDir)
        var env = ProcessInfo.processInfo.environment
        env["AGENT_PORT"] = String(port)
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin")
        p.environment = env
        p.standardOutput = log
        p.standardError = log
        do { try p.run(); server = p } catch {
            return showMessage("Could not start the agent", detail: error.localizedDescription)
        }
        waitForServer(attempt: 0)
    }

    func waitForServer(attempt: Int) {
        reachable { up in
            if up { self.webView.load(URLRequest(url: self.base)); return }
            if attempt > 60 || self.server?.isRunning == false {
                return self.showMessage("The agent did not start", detail: "See \(self.logURL.path)")
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.waitForServer(attempt: attempt + 1) }
        }
    }

    func reachable(_ done: @escaping (Bool) -> Void) {
        var request = URLRequest(url: base.appendingPathComponent("api/state"))
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    func showMessage(_ title: String, detail: String) {
        let esc = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
        webView.loadHTMLString("<html><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#0d1018;color:#eef0f4;font:14px -apple-system,sans-serif\"><div style=\"text-align:center\"><div style=\"color:#37de8f;letter-spacing:.22em;font-size:11px;text-transform:uppercase;margin-bottom:10px\">Mint Labs</div><div style=\"font-size:22px;font-weight:600\">\(esc(title))</div><div style=\"opacity:.55;margin-top:8px\">\(esc(detail))</div></div></body></html>", baseURL: nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { server?.terminate() }

    // Keep the app on the local agent; everything else (Gmail, brand sites) opens in the default browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == "about" || url.scheme == "data" || url.host == "127.0.0.1" || url.host == "localhost" { return decisionHandler(.allow) }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "Approve"); alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    @objc func reload(_ sender: Any?) { webView.reload() }
    @objc func openLog(_ sender: Any?) { NSWorkspace.shared.open(logURL) }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Mint Labs", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Mint Labs", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Mint Labs", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r")
        view.addItem(withTitle: "Open Agent Log", action: #selector(openLog(_:)), keyEquivalent: "l")
        viewItem.submenu = view
        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = win
        NSApp.mainMenu = main
        NSApp.windowsMenu = win
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
