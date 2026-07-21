import AppKit
import SwiftUI

@MainActor
final class CodexProModel: ObservableObject {
    @Published var selectedTheme: CodexTheme = .fallback
    @Published private(set) var themes: [CodexTheme] = [.fallback]
    @Published private(set) var statuses: [String: CodexRuntimeStatus] = [:]
    @Published private(set) var isBusy = false
    @Published private(set) var busyMessage = ""
    @Published private(set) var lastMessage = "正在读取运行状态…"
    @Published var presentedError: String?
    @Published var diagnosticText: String?

    private var runtimeClient: CodexRuntimeClient?
    private var initialThemeResolved = false

    init() {
        do {
            runtimeClient = try CodexRuntimeClient()
        } catch {
            presentedError = error.localizedDescription
            lastMessage = "应用资源检查失败"
        }
    }

    var activeTheme: CodexTheme? {
        themes.first { statuses[$0.id]?.isLive == true }
    }

    var selectedStatus: CodexRuntimeStatus {
        statuses[selectedTheme.id] ?? .stopped(theme: selectedTheme)
    }

    var primaryActionTitle: String {
        if isBusy { return busyMessage }
        if selectedStatus.isHealthy { return "停止 \(selectedTheme.name)" }
        if selectedStatus.needsRepair { return "修复 \(selectedTheme.name)" }
        if activeTheme != nil { return "切换至 \(selectedTheme.name)" }
        return "启动 \(selectedTheme.name)"
    }

    var statusTitle: String {
        if isBusy { return "处理中" }
        guard let activeTheme else { return "待机" }
        return statuses[activeTheme.id]?.isHealthy == true ? "运行中" : "需要检查"
    }

    var statusDetail: String {
        if isBusy { return busyMessage }
        guard let activeTheme else { return "没有皮肤实例正在运行" }
        let status = statuses[activeTheme.id] ?? .stopped(theme: activeTheme)
        if let reason = status.reasonText { return reason }
        if let version = status.appVersion { return "\(activeTheme.name) · Codex \(version)" }
        return "\(activeTheme.name) 主题已连接"
    }

    func select(_ theme: CodexTheme) {
        guard !isBusy else { return }
        initialThemeResolved = true
        withAnimation(.easeInOut(duration: 0.24)) {
            selectedTheme = theme
        }
    }

    func refreshStatus() async {
        await refreshStatus(showFailure: true)
    }

    func performPrimaryAction() async {
        guard let runtimeClient, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let output: String
            if selectedStatus.isHealthy {
                busyMessage = "正在停止…"
                output = try await runtimeClient.stop(theme: selectedTheme)
            } else if selectedStatus.needsRepair {
                busyMessage = "正在修复…"
                output = try await runtimeClient.start(theme: selectedTheme)
            } else if let runningTheme = activeTheme, runningTheme != selectedTheme {
                busyMessage = "正在停止 \(runningTheme.name)…"
                let stopOutput = try await runtimeClient.stop(theme: runningTheme)
                busyMessage = "正在启动 \(selectedTheme.name)…"
                let startOutput = try await runtimeClient.start(theme: selectedTheme)
                output = [stopOutput, startOutput].filter { !$0.isEmpty }.joined(separator: "\n")
            } else {
                busyMessage = "正在启动…"
                output = try await runtimeClient.start(theme: selectedTheme)
            }
            lastMessage = output.isEmpty ? "操作已完成" : output
            await refreshStatus(showFailure: false)
        } catch {
            presentedError = error.localizedDescription
            lastMessage = error.localizedDescription
            await refreshStatus(showFailure: false)
        }
    }

    func runDiagnostics() async {
        guard let runtimeClient, !isBusy else { return }
        isBusy = true
        busyMessage = "正在诊断…"
        defer { isBusy = false }

        do {
            diagnosticText = try await runtimeClient.doctor(theme: selectedTheme)
            lastMessage = "\(selectedTheme.name) 诊断完成"
        } catch {
            presentedError = error.localizedDescription
            lastMessage = error.localizedDescription
        }
    }

    func copyDiagnostics() {
        guard let diagnosticText else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(diagnosticText, forType: .string)
        lastMessage = "诊断信息已复制"
    }

    func monitorRuntime() async {
        await refreshStatus(showFailure: true)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(3))
            if !isBusy {
                await refreshStatus(showFailure: false)
            }
        }
    }

    private func refreshStatus(showFailure: Bool) async {
        guard let runtimeClient else { return }
        do {
            let installedThemes = try await runtimeClient.listThemes()
            guard !installedThemes.isEmpty else {
                throw CodexRuntimeError.invalidStatus("没有可用主题")
            }
            var freshStatuses: [String: CodexRuntimeStatus] = [:]
            for theme in installedThemes {
                freshStatuses[theme.id] = try await runtimeClient.status(for: theme)
            }
            themes = installedThemes
            statuses = freshStatuses
            if !initialThemeResolved,
               let runningTheme = installedThemes.first(where: { freshStatuses[$0.id]?.isLive == true }) {
                selectedTheme = runningTheme
                initialThemeResolved = true
            } else if let currentTheme = installedThemes.first(where: { $0.id == selectedTheme.id }) {
                selectedTheme = currentTheme
            } else if let firstTheme = installedThemes.first {
                selectedTheme = firstTheme
            }
            if lastMessage == "正在读取运行状态…" {
                lastMessage = "运行状态已同步"
            }
        } catch {
            if showFailure {
                presentedError = error.localizedDescription
                lastMessage = error.localizedDescription
            }
        }
    }
}
