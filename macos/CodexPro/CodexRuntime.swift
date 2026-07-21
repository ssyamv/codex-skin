import Foundation

struct CodexRuntimeStatus: Decodable {
    let status: String
    let theme: String
    let themeName: String?
    let reasons: [String]?
    let daemonPid: Int?
    let appPid: Int?
    let port: Int?
    let profileDir: String?
    let appVersion: String?

    var isLive: Bool {
        status == "running" || status == "degraded"
    }

    var isHealthy: Bool {
        status == "running"
    }

    var needsRepair: Bool {
        status == "degraded"
    }

    var reasonText: String? {
        guard let reasons, !reasons.isEmpty else { return nil }
        return reasons.joined(separator: "；")
    }

    static func stopped(theme: CodexTheme) -> CodexRuntimeStatus {
        CodexRuntimeStatus(
            status: "stopped",
            theme: theme.id,
            themeName: theme.name,
            reasons: nil,
            daemonPid: nil,
            appPid: nil,
            port: nil,
            profileDir: nil,
            appVersion: nil
        )
    }
}

struct CodexCommandResult {
    let exitCode: Int32
    let standardOutput: String
    let standardError: String

    var displayText: String {
        let output = standardOutput.trimmingCharacters(in: .whitespacesAndNewlines)
        let error = standardError.trimmingCharacters(in: .whitespacesAndNewlines)
        return [output, error].filter { !$0.isEmpty }.joined(separator: "\n")
    }
}

enum CodexRuntimeError: LocalizedError {
    case missingResource(String)
    case commandFailed(String)
    case invalidStatus(String)

    var errorDescription: String? {
        switch self {
        case .missingResource(let path):
            "应用资源不完整：\(path)"
        case .commandFailed(let message):
            message
        case .invalidStatus(let message):
            "无法读取运行状态：\(message)"
        }
    }
}

final class CodexRuntimeClient {
    private let nodeURL: URL
    private let entrypointURL: URL
    private let runtimeURL: URL

    init(bundle: Bundle = .main) throws {
        guard let resources = bundle.resourceURL else {
            throw CodexRuntimeError.missingResource("Resources")
        }
        runtimeURL = resources.appendingPathComponent("runtime", isDirectory: true)
        nodeURL = runtimeURL.appendingPathComponent("node")
        entrypointURL = runtimeURL.appendingPathComponent("bin/codex-skin.mjs")

        for url in [nodeURL, entrypointURL] where !FileManager.default.fileExists(atPath: url.path) {
            throw CodexRuntimeError.missingResource(url.path)
        }
    }

    func status(for theme: CodexTheme) async throws -> CodexRuntimeStatus {
        let result = try await run(arguments: ["status", "--theme", theme.id, "--json"])
        guard result.exitCode == 0 else {
            throw CodexRuntimeError.commandFailed(result.displayText)
        }
        guard let data = result.standardOutput.data(using: .utf8) else {
            throw CodexRuntimeError.invalidStatus("输出不是 UTF-8")
        }
        do {
            return try JSONDecoder().decode(CodexRuntimeStatus.self, from: data)
        } catch {
            throw CodexRuntimeError.invalidStatus(error.localizedDescription)
        }
    }

    func listThemes() async throws -> [CodexTheme] {
        let result = try await run(arguments: ["themes", "list", "--json"])
        guard result.exitCode == 0 else {
            throw CodexRuntimeError.commandFailed(result.displayText)
        }
        guard let data = result.standardOutput.data(using: .utf8) else {
            throw CodexRuntimeError.invalidStatus("主题列表不是 UTF-8")
        }
        do {
            return try JSONDecoder().decode([CodexTheme].self, from: data)
        } catch {
            throw CodexRuntimeError.invalidStatus("主题列表格式错误：\(error.localizedDescription)")
        }
    }

    func start(theme: CodexTheme) async throws -> String {
        try await successfulOutput(command: "start", theme: theme)
    }

    func stop(theme: CodexTheme) async throws -> String {
        try await successfulOutput(command: "stop", theme: theme)
    }

    func doctor(theme: CodexTheme) async throws -> String {
        try await successfulOutput(command: "doctor", theme: theme, includeJSON: true)
    }

    private func successfulOutput(
        command: String,
        theme: CodexTheme,
        includeJSON: Bool = false
    ) async throws -> String {
        let result = try await run(
            arguments: [command, "--theme", theme.id] + (includeJSON ? ["--json"] : [])
        )
        guard result.exitCode == 0 else {
            throw CodexRuntimeError.commandFailed(
                result.displayText.isEmpty ? "操作失败（退出码 \(result.exitCode)）" : result.displayText
            )
        }
        return result.displayText
    }

    private func run(arguments: [String]) async throws -> CodexCommandResult {
        let nodeURL = nodeURL
        let entrypointURL = entrypointURL

        return try await Task.detached(priority: .userInitiated) {
            let process = Process()
            let outputPipe = Pipe()
            let errorPipe = Pipe()

            process.executableURL = nodeURL
            process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
            process.arguments = [entrypointURL.path] + arguments
            process.environment = ProcessInfo.processInfo.environment
            process.standardOutput = outputPipe
            process.standardError = errorPipe

            try process.run()
            process.waitUntilExit()

            let output = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let error = errorPipe.fileHandleForReading.readDataToEndOfFile()
            return CodexCommandResult(
                exitCode: process.terminationStatus,
                standardOutput: String(decoding: output, as: UTF8.self),
                standardError: String(decoding: error, as: UTF8.self)
            )
        }.value
    }
}
