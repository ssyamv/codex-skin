import Foundation

struct CodexTheme: Identifiable, Hashable, Codable {
    let id: String
    let displayName: String
    let eyebrow: String
    let summary: String
    let appearance: String
    let source: String
    let previewPath: String

    var name: String { displayName }

    static let fallback = CodexTheme(
        id: "makima",
        displayName: "玛奇玛",
        eyebrow: "SAGE CONTRACT ARCHIVE",
        summary: "正在读取已安装主题…",
        appearance: "warm",
        source: "builtin",
        previewPath: ""
    )
}
