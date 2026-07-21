import SwiftUI

@main
struct CodexSkinStudioApp: App {
    @StateObject private var model = CodexProModel()

    var body: some Scene {
        WindowGroup {
            CodexProView(model: model)
                .frame(minWidth: 940, minHeight: 620)
                .task {
                    await model.monitorRuntime()
                }
        }
        .defaultSize(width: 980, height: 660)
        .windowResizability(.contentMinSize)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("运行时") {
                Button("刷新状态") {
                    Task { await model.refreshStatus() }
                }
                .keyboardShortcut("r", modifiers: .command)

                Button("运行诊断") {
                    Task { await model.runDiagnostics() }
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])
            }
        }
    }
}
