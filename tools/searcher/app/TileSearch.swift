// TileSearch: a Mac front end for tilesearch (docs/searcher/board-format.md).
// Edit a board, run it, watch the counts per k and the certificates as they are written.
// Built into TileSearch.app by build.sh, which bundles the tilesearch binary and the example boards.
import AppKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: board

struct Board {
    var name = "untitled"
    var kmin = 1, kmax = 3
    var permutations = false
    var initial = ""                      // vertex numbers, empty = all
    var angles = "", faces = "", vertices = ""   // one statement per line, keyword omitted

    var text: String {
        func block(_ kw: String, _ body: String) -> String {
            body.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }.map { "\(kw) \($0)" }.joined(separator: "\n")
        }
        var out = ["name \(name)", "k \(kmin) \(kmax)", "", block("angle", angles), "",
                   block("face", faces), "", block("vertex", vertices), "",
                   "permutations \(permutations ? "yes" : "no")"]
        let ini = initial.trimmingCharacters(in: .whitespaces)
        if !ini.isEmpty && ini != "all" { out.append("initial \(ini)") }
        return out.joined(separator: "\n") + "\n"
    }

    static func parse(_ text: String) -> Board {
        var b = Board()
        var angles: [String] = [], faces: [String] = [], vertices: [String] = []
        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = raw.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
            let t = line.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
            guard let kw = t.first else { continue }
            let rest = t.dropFirst().joined(separator: " ")
            switch kw {
            case "name": b.name = rest
            case "k" where t.count == 3: b.kmin = Int(t[1]) ?? 1; b.kmax = Int(t[2]) ?? b.kmin
            case "angle": angles.append(rest)
            case "face": faces.append(rest)
            case "vertex": vertices.append(rest)
            case "permutations": b.permutations = rest == "yes"
            case "initial": b.initial = rest == "all" ? "" : rest
            default: break
            }
        }
        b.angles = angles.joined(separator: "\n")
        b.faces = faces.joined(separator: "\n")
        b.vertices = vertices.joined(separator: "\n")
        return b
    }
}

// MARK: run

struct OutFile: Identifiable, Hashable {
    let url: URL
    var id: URL { url }
    let k: Int, labels: String, orientable: Bool, edges: Int, bytes: Int

    // <name>solver_<kk>_<labels>[_o]_<E>.txt
    static let pattern = try! NSRegularExpression(pattern: #"solver_(\d+)_(.+?)(_o)?_(\d+)\.txt$"#)
    init?(_ url: URL, symbols: [String] = []) {
        let n = url.lastPathComponent
        guard let m = OutFile.pattern.firstMatch(in: n, range: NSRange(n.startIndex..., in: n)) else { return nil }
        func g(_ i: Int) -> String? { Range(m.range(at: i), in: n).map { String(n[$0]) } }
        self.url = url
        k = Int(g(1)!) ?? 0
        labels = OutFile.decode(g(2)!, symbols)
        orientable = g(3) != nil
        edges = Int(g(4)!) ?? 0
        bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    }

    // File names print label numbers in hex (A30 is A1e). Rewrite them as the board's symbols, longest
    // match first; a part no symbol explains is left as it is.
    static func decode(_ s: String, _ symbols: [String]) -> String {
        let hex = symbols.compactMap { sym -> (String, String)? in
            var letter = "", num = sym
            if let f = sym.first, "SMLABCDEFG".contains(f), sym.count > 1 { letter = String(f); num = String(sym.dropFirst()) }
            if num == "oo" { return (letter + "oo", sym) }
            guard num.first != "0", let n = Int(num) else { return nil }
            return (letter + String(n, radix: 16), sym)
        } + [("Pi", "Pi")]
        var out: [String] = [], rest = Substring(s)
        while !rest.isEmpty {
            guard let (h, sym) = hex.filter({ rest.hasPrefix($0.0) }).max(by: { $0.0.count < $1.0.count }) else {
                return s
            }
            out.append(sym)
            rest = rest.dropFirst(h.count)
        }
        return out.joined(separator: " ")
    }
}

final class Runner: ObservableObject {
    @Published var running = false
    @Published var status = "Ready"
    @Published var counts: [Int: Int] = [:]
    @Published var total = 0
    @Published var elapsed = 0.0
    @Published var rate = 0.0
    @Published var log: [String] = []
    @Published var files: [OutFile] = []
    @Published var runDir: URL?

    private var process: Process?
    private var buffer = Data()
    private var timer: Timer?
    private var stopped = false
    private var last: (Double, Int) = (0, 0)

    private var name = ""
    private var symbols: [String] = []

    init() {   // a search must not outlive the app that started it
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) {
            [weak self] _ in self?.process?.terminate()
        }
    }
    var outDir: URL? { runDir?.appendingPathComponent("solver_" + name) }

    func run(_ board: Board, threads: Int, root: URL) {
        let stamp = DateFormatter()
        stamp.dateFormat = "yyyyMMdd-HHmmss"
        let dir = root.appendingPathComponent("\(board.name)-\(stamp.string(from: Date()))")
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try board.text.write(to: dir.appendingPathComponent("input.board"), atomically: true, encoding: .utf8)
        } catch { status = "Cannot write \(dir.path): \(error.localizedDescription)"; return }
        guard let exe = Bundle.main.url(forResource: "tilesearch", withExtension: nil) else {
            status = "tilesearch is missing from the app bundle"; return
        }
        let p = Process()
        p.executableURL = exe
        p.arguments = ["input.board", "--threads", String(threads), "--progress"]
        p.currentDirectoryURL = dir
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            let d = h.availableData
            DispatchQueue.main.async { self?.consume(d) }
        }
        p.terminationHandler = { [weak self] p in
            DispatchQueue.main.async { self?.finished(p.terminationStatus) }
        }
        counts = [:]; total = 0; elapsed = 0; rate = 0; log = []; files = []; buffer = Data()
        last = (0, 0); stopped = false; runDir = dir; name = board.name
        symbols = board.angles.split(separator: "\n").compactMap { $0.split(separator: " ").first.map(String.init) }
        do { try p.run() } catch { status = "Cannot start tilesearch: \(error.localizedDescription)"; return }
        process = p
        running = true
        status = "Searching"
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.scanFiles() }
    }

    func stop() {
        stopped = true
        process?.terminate()
    }

    private func consume(_ d: Data) {
        buffer.append(d)
        while let nl = buffer.firstIndex(of: 10) {
            let line = String(decoding: buffer[buffer.startIndex..<nl], as: UTF8.self)
            buffer.removeSubrange(buffer.startIndex...nl)
            handle(line)
        }
    }

    private func handle(_ line: String) {
        let t = line.split(separator: " ")
        guard t.first == "progress", t.count >= 3 else {
            if !line.hasPrefix("Created ") && !line.isEmpty { log.append(line) }
            if log.count > 2000 { log.removeFirst(log.count - 2000) }
            return
        }
        elapsed = Double(t[1]) ?? elapsed
        total = Int(t[2]) ?? total
        for kv in t.dropFirst(3) {
            let p = kv.split(separator: ":")
            if p.count == 2, let k = Int(p[0]), let n = Int(p[1]) { counts[k] = n }
        }
        if elapsed > last.0 + 0.2 {
            rate = Double(total - last.1) / (elapsed - last.0)
            last = (elapsed, total)
        }
    }

    private func finished(_ code: Int32) {
        timer?.invalidate()
        running = false
        scanFiles()
        status = stopped ? "Stopped after \(fmt(elapsed)) s; the files hold what was found until then"
            : code == 0 ? "Finished: \(total) tilings in \(fmt(elapsed)) s"
            : "tilesearch failed (exit \(code)); see the log"
    }

    func scanFiles() {
        guard let d = outDir, let urls = try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: [.fileSizeKey])
        else { return }
        files = urls.compactMap { OutFile($0, symbols: symbols) }.sorted { ($0.k, $0.labels, $0.edges) < ($1.k, $1.labels, $1.edges) }
    }
}

func fmt(_ x: Double) -> String { String(format: "%.1f", x) }

// MARK: views

struct ContentView: View {
    @State private var board = Board()
    @State private var threads = ProcessInfo.processInfo.activeProcessorCount
    @State private var root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/TileSearch")
    @State private var selected: OutFile.ID?
    @StateObject private var runner = Runner()

    var body: some View {
        HSplitView {
            editor.frame(minWidth: 340, idealWidth: 400)
            results.frame(minWidth: 520)
        }
        .frame(minWidth: 960, minHeight: 640)
        .onAppear(perform: testHook)
    }

    // Test hook, for checking the window without Screen Recording permission:
    // TILESEARCH_BOARD=<file> loads a board, TILESEARCH_RUN=<output folder> runs it there, and
    // TILESEARCH_SNAPSHOT=<prefix> writes <prefix>-<s>.png of this window at 2, 6 and 15 s.
    private func testHook() {
        let env = ProcessInfo.processInfo.environment
        if let b = env["TILESEARCH_BOARD"] { load(URL(fileURLWithPath: b)) }
        if let r = env["TILESEARCH_RUN"] {
            root = URL(fileURLWithPath: r)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { runner.run(board, threads: threads, root: root) }
        }
        guard let prefix = env["TILESEARCH_SNAPSHOT"] else { return }
        for t in [2.0, 6.0, 15.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) {
                if t > 2, selected == nil { selected = runner.files.last?.id }
                guard let v = NSApp.windows.first?.contentView?.superview,
                      let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { return }
                v.cacheDisplay(in: v.bounds, to: rep)
                try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "\(prefix)-\(Int(t)).png"))
            }
        }
    }

    // ---- left: the board

    private var editor: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button("Open…", action: open)
                Button("Save…", action: save)
                Menu("Examples") {
                    ForEach(examples, id: \.self) { u in
                        Button(u.deletingPathExtension().lastPathComponent) { load(u) }
                    }
                }.fixedSize()
                Spacer()
            }
            Grid(alignment: .leading, verticalSpacing: 8) {
                GridRow { Text("Name"); TextField("", text: $board.name) }
                GridRow {
                    Text("k")
                    HStack {
                        Stepper("from \(board.kmin)", value: $board.kmin, in: 1...max(1, board.kmax))
                        Stepper("to \(board.kmax)", value: $board.kmax, in: board.kmin...99)
                    }
                }
                GridRow { Text("Initial"); TextField("all, or vertex numbers", text: $board.initial) }
                GridRow { Text(""); Toggle("Permutations: every cyclic order of each vertex", isOn: $board.permutations) }
            }
            field("Angles", "symbol [value]   e.g.  A4 90", $board.angles)
            field("Faces", "symbols x multiplier   e.g.  A4 x 4,  Loo Pi x inf", $board.faces)
            field("Vertices (numbered from 1)", "symbols round the vertex   e.g.  A4 A4 A4 A4", $board.vertices)
            Divider()
            HStack {
                Stepper("Threads: \(threads)", value: $threads, in: 1...max(1, ProcessInfo.processInfo.activeProcessorCount * 2))
                Spacer()
            }
            HStack {
                Text(root.path).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.head)
                Spacer()
                Button("Output folder…", action: chooseRoot)
            }
            HStack {
                if runner.running {
                    Button("Stop", role: .destructive, action: runner.stop).keyboardShortcut(".", modifiers: .command)
                } else {
                    Button("Run search") { selected = nil; runner.run(board, threads: threads, root: root) }
                        .keyboardShortcut(.return, modifiers: .command)
                        .buttonStyle(.borderedProminent)
                }
                Spacer()
            }
        }
        .padding()
    }

    private func field(_ title: String, _ hint: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.headline)
            Text(hint).font(.caption).foregroundStyle(.secondary)
            TextEditor(text: text)
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 60)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.quaternary))
        }
    }

    // ---- right: progress and results

    private var results: some View {
        VSplitView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    if runner.running { ProgressView().controlSize(.small) }
                    Text(runner.status).font(.headline)
                    Spacer()
                    if let d = runner.runDir {
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([d]) }
                    }
                }
                HStack(spacing: 24) {
                    stat("tilings", "\(runner.total)")
                    stat("elapsed", "\(fmt(runner.elapsed)) s")
                    stat("rate", runner.running ? "\(Int(runner.rate)) / s" : "–")
                    stat("files", "\(runner.files.count)")
                }
                Grid(alignment: .trailing, horizontalSpacing: 16, verticalSpacing: 2) {
                    GridRow { Text("k").bold(); Text("tilings").bold() }
                    ForEach(board.kmin...max(board.kmin, board.kmax), id: \.self) { k in
                        GridRow {
                            Text("\(k)")
                            Text(runner.counts[k].map(String.init) ?? "–").monospacedDigit()
                        }
                    }
                }
            }
            .padding()
            .frame(minHeight: 150)

            Table(runner.files, selection: $selected) {
                TableColumn("k") { Text("\($0.k)") }.width(30)
                TableColumn("corners") { Text($0.labels).font(.system(.body, design: .monospaced)) }
                TableColumn("orientable") { Text($0.orientable ? "yes" : "") }.width(70)
                TableColumn("edge orbits") { Text("\($0.edges)") }.width(80)
                TableColumn("size") { Text(ByteCountFormatter.string(fromByteCount: Int64($0.bytes), countStyle: .file)) }.width(70)
            }
            .frame(minHeight: 140)

            TabView {
                CertificateView(file: runner.files.first { $0.id == selected }, tick: runner.total)
                    .tabItem { Text("Certificates") }
                ScrollView {
                    Text(runner.log.joined(separator: "\n"))
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(6)
                }
                .tabItem { Text("Log") }
            }
            .frame(minHeight: 160)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(value).font(.title3).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    // ---- files

    private var examples: [URL] {
        (Bundle.main.urls(forResourcesWithExtension: "board", subdirectory: "boards") ?? [])
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    private func load(_ u: URL) {
        if let s = try? String(contentsOf: u) { board = Board.parse(s) }
    }

    private func open() {
        let p = NSOpenPanel()
        p.allowedContentTypes = [.plainText, UTType(filenameExtension: "board") ?? .data]
        if p.runModal() == .OK, let u = p.url { load(u) }
    }

    private func save() {
        let p = NSSavePanel()
        p.nameFieldStringValue = board.name + ".board"
        if p.runModal() == .OK, let u = p.url { try? board.text.write(to: u, atomically: true, encoding: .utf8) }
    }

    private func chooseRoot() {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canChooseFiles = false
        p.canCreateDirectories = true
        if p.runModal() == .OK, let u = p.url { root = u }
    }
}

// The first 64 KB of the selected file, reread as the search writes more.
struct CertificateView: View {
    let file: OutFile?
    let tick: Int
    @State private var text = ""
    @State private var shown = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let f = file {
                Text("\(f.url.lastPathComponent): first \(shown) tilings shown")
                    .font(.caption).foregroundStyle(.secondary)
                ScrollView {
                    Text(text).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(6)
                }
            } else {
                Text("Select a file to see its tilings.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(6)
        .onChange(of: file) { f in reload(f) }   // the new value: this closure can see the old `file`
        .onChange(of: tick) { _ in reload(file) }
        .onAppear { reload(file) }
    }

    private func reload(_ file: OutFile?) {
        guard let f = file, let h = try? FileHandle(forReadingFrom: f.url) else { text = ""; shown = 0; return }
        defer { try? h.close() }
        var s = String(decoding: h.readData(ofLength: 65536), as: UTF8.self)
        if let end = s.range(of: "---\n", options: .backwards) { s = String(s[..<end.upperBound]) }
        text = s
        shown = s.components(separatedBy: "Number of vertices:").count - 1
    }
}

@main
struct TileSearchApp: App {
    var body: some Scene {
        WindowGroup("TileSearch") { ContentView() }
    }
}
