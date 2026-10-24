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

enum JobState: String { case running, stopped, finished, failed }

// One run folder: input.board, plus solver_<name>/ once started. census.txt ending in MAX means the
// search finished; anything else is a stopped run that `tilesearch --resume` continues from the first
// unfinished root (roots.done lists the finished ones).
final class Job: ObservableObject, Identifiable {
    let dir: URL
    var id: URL { dir }
    let board: Board
    @Published var state = JobState.stopped
    @Published var note = ""
    @Published var counts: [Int: Int] = [:]
    @Published var total = 0
    @Published var elapsed = 0.0
    @Published var rate = 0.0
    @Published var roots = (done: 0, all: 0)
    @Published var log: [String] = []
    @Published var files: [OutFile] = []

    private var process: Process?
    private var buffer = Data()
    private var stopping = false
    private var last: (Double, Int) = (0, 0)
    private let symbols: [String]
    var outDir: URL { dir.appendingPathComponent("solver_" + board.name) }

    init?(dir: URL) {
        guard let text = try? String(contentsOf: dir.appendingPathComponent("input.board")) else { return nil }
        self.dir = dir
        board = Board.parse(text)
        symbols = board.angles.split(separator: "\n").compactMap { $0.split(separator: " ").first.map(String.init) }
        readDisk()
    }

    // What the files say: the census of a finished run, or the sum of roots.done for a stopped one. A
    // stopped run's half-done root is not counted: resuming runs it again from the start.
    func readDisk() {
        func pairs(_ s: Substring) -> (Int, Int)? {
            let p = s.split(separator: ":")
            guard p.count == 2, let k = Int(p[0]), let n = Int(p[1]) else { return nil }
            return (k, n)
        }
        var c: [Int: Int] = [:]
        let census = (try? String(contentsOf: outDir.appendingPathComponent("census.txt"))) ?? ""
        if census.hasSuffix("MAX\n") {
            for line in census.split(separator: "\n") {   // k=3 -- 1254
                if let (k, n) = pairs(Substring(line.replacingOccurrences(of: "k=", with: "").replacingOccurrences(of: " -- ", with: ":"))) { c[k] = n }
            }
            state = .finished
        } else {
            let done = ((try? String(contentsOf: outDir.appendingPathComponent("roots.done"))) ?? "").split(separator: "\n")
            for line in done { for kv in line.split(separator: " ").dropFirst() { if let (k, n) = pairs(kv) { c[k, default: 0] += n } } }
            roots.done = done.count
            if state != .failed { state = .stopped }
        }
        counts = c
        total = c.values.reduce(0, +)
        scanFiles()
    }

    func start(threads: Int) {
        guard state != .running, state != .finished else { return }
        guard let exe = Bundle.main.url(forResource: "tilesearch", withExtension: nil) else { note = "tilesearch is missing from the app bundle"; return }
        let resume = FileManager.default.fileExists(atPath: outDir.path)
        let p = Process()
        p.executableURL = exe
        // nice 10: the search takes the cores the rest of the Mac is not using, and yields to it otherwise
        p.arguments = ["input.board", "--threads", String(threads), "--nice", "10", "--progress"] + (resume ? ["--resume"] : [])
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
        buffer = Data(); stopping = false; elapsed = 0; rate = 0; last = (0, total)
        do { try p.run() } catch { note = "Cannot start tilesearch: \(error.localizedDescription)"; state = .failed; return }
        process = p
        state = .running
        note = resume ? "Resumed with \(roots.done) roots already done" : ""
    }

    func stop(_ why: String = "") {
        guard state == .running else { return }
        stopping = true
        note = why
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
        if t.first == "roots", t.count == 3 { roots = (Int(t[1]) ?? 0, Int(t[2]) ?? 0); return }
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
        process = nil
        if !stopping && code != 0 { state = .failed; note = "tilesearch failed (exit \(code)); see the log" }
        readDisk()
        if stopping && note.isEmpty { note = "Resume runs the \(roots.all - roots.done) unfinished roots" }
        if state == .finished { note = "\(total) tilings" }
    }

    func scanFiles() {
        guard let urls = try? FileManager.default.contentsOfDirectory(at: outDir, includingPropertiesForKeys: [.fileSizeKey]) else { return }
        files = urls.compactMap { OutFile($0, symbols: symbols) }.sorted { ($0.k, $0.labels, $0.edges) < ($1.k, $1.labels, $1.edges) }
    }
}

// Every run folder under the output folder, and the guard that stops all runs when the disk fills.
final class Store: ObservableObject {
    static let minFreeBytes: Int64 = 10 << 30
    @Published var jobs: [Job] = []
    @Published var freeBytes: Int64 = 0
    @Published var root: URL { didSet { UserDefaults.standard.set(root.path, forKey: "root"); rescan() } }
    private var timer: Timer?

    init() {
        root = URL(fileURLWithPath: UserDefaults.standard.string(forKey: "root")
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/TileSearch").path)
        rescan()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) {
            [weak self] _ in self?.jobs.forEach { $0.stop() }   // a search must not outlive the app that started it
        }
    }

    func rescan() {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        let known = Dictionary(uniqueKeysWithValues: jobs.map { ($0.dir.standardizedFileURL, $0) })
        jobs = dirs.compactMap { known[$0.standardizedFileURL] ?? Job(dir: $0) }
            .sorted { $0.dir.lastPathComponent > $1.dir.lastPathComponent }
        tick()
    }

    func newRun(_ board: Board, threads: Int) -> Job? {
        let stamp = DateFormatter()
        stamp.dateFormat = "yyyyMMdd-HHmmss"
        let dir = root.appendingPathComponent("\(board.name)-\(stamp.string(from: Date()))")
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try board.text.write(to: dir.appendingPathComponent("input.board"), atomically: true, encoding: .utf8)
        } catch { return nil }
        guard let job = Job(dir: dir) else { return nil }
        jobs.insert(job, at: 0)
        start(job, threads: threads)
        return job
    }

    func start(_ job: Job, threads: Int) {
        tick()
        if freeBytes < Store.minFreeBytes { job.note = "Not started: under 10 GB free on disk"; return }
        job.start(threads: threads)
    }

    // Once a second, from the timer: also redraws the runs table, whose cells read their job directly.
    // (Cells that observed their job redrew mid-layout, which AppKit flags as reentrant.)
    private func tick() {
        objectWillChange.send()
        let v = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        freeBytes = v?.volumeAvailableCapacityForImportantUsage ?? 0
        for j in jobs where j.state == .running {
            j.scanFiles()
            if freeBytes < Store.minFreeBytes { j.stop("Stopped: under 10 GB free on disk") }
        }
    }
}

func fmt(_ x: Double) -> String { String(format: "%.1f", x) }

// MARK: views

struct ContentView: View {
    @State private var board = Board()
    @State private var threads = ProcessInfo.processInfo.activeProcessorCount
    @State private var selected: Job.ID?
    @StateObject private var store = Store()

    var body: some View {
        HSplitView {
            editor.frame(minWidth: 340, idealWidth: 400)
            VSplitView {
                runs.frame(minHeight: 120, idealHeight: 160)
                if let job = store.jobs.first(where: { $0.id == selected }) {
                    JobView(job: job, threads: threads, store: store, load: { board = $0 }).id(job.id)
                } else {
                    Text("Run a search, or select one above.").foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(minWidth: 560)
        }
        .frame(minWidth: 1000, minHeight: 680)
        .onAppear(perform: testHook)
    }

    // Test hook, for checking the window without Screen Recording permission:
    // TILESEARCH_BOARD=<file> loads a board, TILESEARCH_RUN=<output folder> runs it there,
    // TILESEARCH_STOP=<s> / TILESEARCH_RESUME=<s> / TILESEARCH_QUIT=<s> stop it, resume it and quit the app, and
    // TILESEARCH_SNAPSHOT=<prefix> writes <prefix>-<s>.png of this window at TILESEARCH_SHOTS (default 2,6,15).
    private func testHook() {
        let env = ProcessInfo.processInfo.environment
        let at = { (k: String, f: @escaping () -> Void) in
            if let s = env[k].flatMap(Double.init) { DispatchQueue.main.asyncAfter(deadline: .now() + s, execute: f) }
        }
        if let b = env["TILESEARCH_BOARD"] { load(URL(fileURLWithPath: b)) }
        if let r = env["TILESEARCH_RUN"] {
            store.root = URL(fileURLWithPath: r)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { selected = store.newRun(board, threads: threads)?.id }
        }
        at("TILESEARCH_STOP") { store.jobs.first?.stop() }
        at("TILESEARCH_RESUME") { if let j = store.jobs.first { store.start(j, threads: threads) } }
        at("TILESEARCH_QUIT") { NSApp.terminate(nil) }
        guard let prefix = env["TILESEARCH_SNAPSHOT"] else { return }
        for t in (env["TILESEARCH_SHOTS"] ?? "2,6,15").split(separator: ",").compactMap({ Double($0) }) {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) {
                guard let v = NSApp.windows.first(where: { $0.title == "TileSearch" })?.contentView?.superview,
                      let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { NSLog("snapshot %g: no window", t); return }
                v.cacheDisplay(in: v.bounds, to: rep)
                do { try rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "\(prefix)-\(Int(t)).png")) }
                catch { NSLog("snapshot %g: %@", t, error.localizedDescription) }
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
                Stepper("Threads per search: \(threads)", value: $threads, in: 1...max(1, ProcessInfo.processInfo.activeProcessorCount * 2))
                Spacer()
            }
            HStack {
                Text(store.root.path).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.head)
                Spacer()
                Button("Output folder…", action: chooseRoot)
            }
            HStack {
                Button("Run search") { selected = store.newRun(board, threads: threads)?.id }
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
                Spacer()
                Text("\(ByteCountFormatter.string(fromByteCount: store.freeBytes, countStyle: .file)) free")
                    .font(.caption).foregroundStyle(store.freeBytes < Store.minFreeBytes ? .red : .secondary)
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

    // ---- right, top: every run in the output folder

    private var runs: some View {
        Table(store.jobs, selection: $selected) {
            TableColumn("run") { Text($0.dir.lastPathComponent) }
            TableColumn("state") { Text($0.state.rawValue).foregroundStyle($0.state == .running ? .green : $0.state == .failed ? .red : .primary) }.width(70)
            TableColumn("tilings") { Text("\($0.total)").monospacedDigit() }.width(90)
            TableColumn("roots") { Text($0.roots.all > 0 ? "\($0.roots.done) / \($0.roots.all)" : "\($0.roots.done)").monospacedDigit() }.width(80)
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
        if p.runModal() == .OK, let u = p.url { store.root = u }
    }
}

// ---- right, bottom: one run

struct JobView: View {
    @ObservedObject var job: Job
    let threads: Int
    let store: Store
    let load: (Board) -> Void
    @State private var selected: OutFile.ID?

    var body: some View {
        VSplitView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    if job.state == .running { ProgressView().controlSize(.small) }
                    Text(job.state.rawValue.capitalized).font(.headline)
                    Text(job.note).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    if job.state == .running {
                        Button("Stop", role: .destructive) { job.stop() }.keyboardShortcut(".", modifiers: .command)
                    } else if job.state != .finished {
                        Button("Resume") { store.start(job, threads: threads) }.buttonStyle(.borderedProminent)
                    }
                    Button("Edit board") { load(job.board) }
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([job.dir]) }
                }
                HStack(spacing: 24) {
                    stat("tilings", "\(job.total)")
                    stat("roots done", job.roots.all > 0 ? "\(job.roots.done) / \(job.roots.all)" : "\(job.roots.done)")
                    stat("elapsed", job.state == .running ? "\(fmt(job.elapsed)) s" : "–")
                    stat("rate", job.state == .running ? "\(Int(job.rate)) / s" : "–")
                    stat("files", "\(job.files.count)")
                }
                Grid(alignment: .trailing, horizontalSpacing: 16, verticalSpacing: 2) {
                    GridRow { Text("k").bold(); Text("tilings").bold() }
                    ForEach(job.board.kmin...max(job.board.kmin, job.board.kmax), id: \.self) { k in
                        GridRow { Text("\(k)"); Text(job.counts[k].map(String.init) ?? "–").monospacedDigit() }
                    }
                }
            }
            .padding()
            .frame(minHeight: 150)

            Table(job.files, selection: $selected) {
                TableColumn("k") { Text("\($0.k)") }.width(30)
                TableColumn("corners") { Text($0.labels).font(.system(.body, design: .monospaced)) }
                TableColumn("orientable") { Text($0.orientable ? "yes" : "") }.width(70)
                TableColumn("edge orbits") { Text("\($0.edges)") }.width(80)
                TableColumn("size") { Text(ByteCountFormatter.string(fromByteCount: Int64($0.bytes), countStyle: .file)) }.width(70)
            }
            .frame(minHeight: 120)

            TabView {
                CertificateView(file: job.files.first { $0.id == selected }, tick: job.total)
                    .tabItem { Text("Certificates") }
                ScrollView {
                    Text(job.log.joined(separator: "\n"))
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(6)
                }
                .tabItem { Text("Log") }
            }
            .frame(minHeight: 140)
        }
        .onAppear {   // the test hook's snapshots show a certificate
            if ProcessInfo.processInfo.environment["TILESEARCH_SNAPSHOT"] != nil {
                DispatchQueue.main.asyncAfter(deadline: .now() + 4) { selected = job.files.last?.id }
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(value).font(.title3).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
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
