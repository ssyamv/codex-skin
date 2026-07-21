import AppKit
import SwiftUI

struct CodexProView: View {
    @ObservedObject var model: CodexProModel

    var body: some View {
        ZStack {
            ConsoleBackground(accent: accentColor)

            HStack(spacing: 0) {
                themeStage
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                controlPanel
                    .frame(width: 350)
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .alert(
            "操作未完成",
            isPresented: Binding(
                get: { model.presentedError != nil },
                set: { if !$0 { model.presentedError = nil } }
            )
        ) {
            Button("好") { model.presentedError = nil }
        } message: {
            Text(model.presentedError ?? "未知错误")
        }
        .sheet(
            isPresented: Binding(
                get: { model.diagnosticText != nil },
                set: { if !$0 { model.diagnosticText = nil } }
            )
        ) {
            diagnosticsSheet
        }
    }

    private var accentColor: Color {
        themeAccent(model.selectedTheme)
    }

    private var themeStage: some View {
        ZStack(alignment: .bottomLeading) {
            ThemePreviewImage(theme: model.selectedTheme)
                .id(model.selectedTheme)
                .transition(.opacity)

            LinearGradient(
                colors: [.clear, Color.black.opacity(0.12), Color.black.opacity(0.78)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    brandMark
                    Spacer()
                    Text("DESKTOP THEME RUNTIME")
                        .font(.custom("Avenir Next Demi Bold", size: 10))
                        .tracking(2.2)
                        .foregroundStyle(.white.opacity(0.62))
                }

                Spacer()

                Text(model.selectedTheme.eyebrow)
                    .font(.custom("Avenir Next Demi Bold", size: 11))
                    .tracking(2.4)
                    .foregroundStyle(accentColor)
                    .padding(.bottom, 10)

                Text(model.selectedTheme.name)
                    .font(.custom("New York", size: 48).weight(.semibold))
                    .foregroundStyle(.white)
                    .contentTransition(.numericText())

                Text(model.selectedTheme.summary)
                    .font(.custom("Avenir Next", size: 14))
                    .foregroundStyle(.white.opacity(0.72))
                    .padding(.top, 6)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(model.themes) { theme in
                            ThemeSelector(
                                theme: theme,
                                selected: model.selectedTheme == theme,
                                running: model.statuses[theme.id]?.isLive == true,
                                accent: themeAccent(theme)
                            ) {
                                model.select(theme)
                            }
                        }
                    }
                }
                .padding(.top, 24)
            }
            .padding(28)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.32), radius: 34, y: 20)
        .animation(.easeInOut(duration: 0.24), value: model.selectedTheme)
    }

    private var brandMark: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(.black.opacity(0.34))
                Circle()
                    .stroke(.white.opacity(0.28), lineWidth: 1)
                Text("CS")
                    .font(.custom("Avenir Next Demi Bold", size: 11))
                    .tracking(0.8)
                    .foregroundStyle(.white)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 1) {
                Text("CODEX SKIN STUDIO")
                    .font(.custom("Avenir Next Demi Bold", size: 12))
                    .tracking(1.5)
                Text("SKIN CONSOLE")
                    .font(.custom("Avenir Next Medium", size: 9))
                    .tracking(1.8)
                    .foregroundStyle(.white.opacity(0.52))
            }
        }
    }

    private var controlPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("SESSION CONTROL")
                .font(.custom("Avenir Next Demi Bold", size: 10))
                .tracking(2.4)
                .foregroundStyle(.white.opacity(0.45))

            Text("你的 Codex，\n另一种表情。")
                .font(.custom("New York", size: 31).weight(.medium))
                .foregroundStyle(.white.opacity(0.94))
                .padding(.top, 18)

            Text("保留官方应用与代码签名，只管理隔离的主题实例。")
                .font(.custom("Avenir Next", size: 13))
                .foregroundStyle(.white.opacity(0.48))
                .lineSpacing(4)
                .padding(.top, 12)

            statusBlock
                .padding(.top, 34)

            Spacer()

            Button {
                Task { await model.performPrimaryAction() }
            } label: {
                HStack {
                    if model.isBusy {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    } else {
                        Image(systemName: primaryActionIcon)
                            .font(.system(size: 11, weight: .bold))
                    }
                    Text(model.primaryActionTitle)
                        .font(.custom("Avenir Next Demi Bold", size: 14))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .semibold))
                        .opacity(model.isBusy ? 0 : 0.7)
                }
                .padding(.horizontal, 18)
                .frame(height: 52)
                .background(accentColor.gradient)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(model.isBusy)
            .shadow(color: accentColor.opacity(0.26), radius: 18, y: 8)

            HStack(spacing: 10) {
                SecondaryButton(title: "刷新", icon: "arrow.clockwise") {
                    Task { await model.refreshStatus() }
                }
                SecondaryButton(title: "诊断", icon: "stethoscope") {
                    Task { await model.runDiagnostics() }
                }
            }
            .padding(.top, 10)
            .disabled(model.isBusy)

            Divider()
                .overlay(.white.opacity(0.10))
                .padding(.vertical, 18)

            Text("最近操作")
                .font(.custom("Avenir Next Demi Bold", size: 10))
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.36))

            Text(model.lastMessage.components(separatedBy: .newlines).last ?? model.lastMessage)
                .font(.custom("Avenir Next", size: 11))
                .foregroundStyle(.white.opacity(0.50))
                .lineLimit(2)
                .padding(.top, 6)
        }
        .padding(.leading, 30)
        .padding(.vertical, 22)
    }

    private var statusBlock: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: statusColor.opacity(0.7), radius: 7)
                Text(model.statusTitle.uppercased())
                    .font(.custom("Avenir Next Demi Bold", size: 11))
                    .tracking(1.8)
                Spacer()
                if let port = model.statuses[(model.activeTheme ?? model.selectedTheme).id]?.port {
                    Text(verbatim: "LOCAL :\(port)")
                        .font(.system(size: 9, design: .monospaced).weight(.medium))
                        .foregroundStyle(.white.opacity(0.34))
                }
            }

            Text(model.statusDetail)
                .font(.custom("Avenir Next Medium", size: 13))
                .foregroundStyle(.white.opacity(0.72))
                .lineLimit(3)

            if let pid = model.statuses[(model.activeTheme ?? model.selectedTheme).id]?.daemonPid {
                HStack(spacing: 18) {
                    RuntimeMetric(label: "DAEMON", value: "#\(pid)")
                    RuntimeMetric(
                        label: "THEME",
                        value: (model.activeTheme ?? model.selectedTheme).id.uppercased()
                    )
                }
            }
        }
        .padding(18)
        .background(.white.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        }
    }

    private var statusColor: Color {
        if model.isBusy { return .orange }
        guard let activeTheme = model.activeTheme,
              let status = model.statuses[activeTheme.id] else { return .gray }
        return status.isHealthy ? Color(red: 0.38, green: 0.78, blue: 0.58) : .orange
    }

    private func themeAccent(_ theme: CodexTheme) -> Color {
        switch theme.appearance.lowercased() {
        case "red", "crimson":
            Color(red: 0.82, green: 0.24, blue: 0.31)
        case "violet", "purple":
            Color(red: 0.56, green: 0.38, blue: 0.86)
        case "blue", "cool":
            Color(red: 0.28, green: 0.55, blue: 0.86)
        case "green", "sage":
            Color(red: 0.39, green: 0.64, blue: 0.50)
        default:
            Color(red: 0.68, green: 0.42, blue: 0.31)
        }
    }

    private var primaryActionIcon: String {
        if model.selectedStatus.isHealthy { return "stop.fill" }
        if model.selectedStatus.needsRepair { return "wrench.and.screwdriver.fill" }
        return "play.fill"
    }

    private var diagnosticsSheet: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("运行诊断")
                        .font(.custom("New York", size: 25).weight(.semibold))
                    Text(model.selectedTheme.name)
                        .font(.custom("Avenir Next Medium", size: 11))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("复制") { model.copyDiagnostics() }
                Button("完成") { model.diagnosticText = nil }
                    .keyboardShortcut(.defaultAction)
            }

            ScrollView {
                Text(model.diagnosticText ?? "")
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }
            .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .padding(24)
        .frame(width: 650, height: 480)
    }
}

private struct ConsoleBackground: View {
    let accent: Color

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.055, green: 0.060, blue: 0.070),
                    Color(red: 0.026, green: 0.029, blue: 0.035),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [accent.opacity(0.14), .clear],
                center: .topLeading,
                startRadius: 10,
                endRadius: 520
            )
            Canvas { context, size in
                for row in 0..<20 {
                    for column in 0..<30 where (row + column) % 3 == 0 {
                        let rect = CGRect(
                            x: CGFloat(column) * size.width / 30,
                            y: CGFloat(row) * size.height / 20,
                            width: 1,
                            height: 1
                        )
                        context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.035)))
                    }
                }
            }
        }
        .ignoresSafeArea()
    }
}

private struct ThemePreviewImage: View {
    let theme: CodexTheme

    var body: some View {
        GeometryReader { proxy in
            if !theme.previewPath.isEmpty,
               let image = NSImage(contentsOfFile: theme.previewPath) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .offset(x: theme.id == "makima" ? 42 : 0)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
            } else {
                LinearGradient(
                    colors: [.black, .gray.opacity(0.5)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

private struct ThemeSelector: View {
    let theme: CodexTheme
    let selected: Bool
    let running: Bool
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Circle()
                    .fill(selected ? accent : .white.opacity(0.20))
                    .frame(width: 7, height: 7)
                Text(theme.name)
                    .font(.custom("Avenir Next Demi Bold", size: 12))
                if running {
                    Text("LIVE")
                        .font(.custom("Avenir Next Bold", size: 8))
                        .tracking(1.1)
                        .foregroundStyle(Color(red: 0.55, green: 0.91, blue: 0.69))
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 38)
            .foregroundStyle(.white.opacity(selected ? 0.98 : 0.62))
            .background(selected ? .white.opacity(0.13) : .black.opacity(0.18))
            .clipShape(Capsule())
            .overlay {
                Capsule().stroke(.white.opacity(selected ? 0.24 : 0.08), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct SecondaryButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.custom("Avenir Next Demi Bold", size: 12))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(.white.opacity(0.045))
                .foregroundStyle(.white.opacity(0.64))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }
}

private struct RuntimeMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.custom("Avenir Next Demi Bold", size: 8))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.28))
            Text(value)
                .font(.system(size: 10, design: .monospaced).weight(.medium))
                .foregroundStyle(.white.opacity(0.58))
        }
    }
}
