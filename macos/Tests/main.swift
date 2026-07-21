import Foundation

let payload = """
[
  {
    "id": "makima",
    "displayName": "玛奇玛",
    "eyebrow": "SAGE CONTRACT ARCHIVE",
    "summary": "内置主题",
    "appearance": "warm",
    "source": "builtin",
    "previewPath": "/tmp/makima.png"
  },
  {
    "id": "faye",
    "displayName": "Faye",
    "eyebrow": "BEBOP AFTER MIDNIGHT",
    "summary": "内置主题",
    "appearance": "crimson",
    "source": "builtin",
    "previewPath": "/tmp/faye.png"
  },
  {
    "id": "neon-rain",
    "displayName": "Neon Rain",
    "eyebrow": "USER GENERATED",
    "summary": "任意第三方主题",
    "appearance": "violet",
    "source": "user",
    "previewPath": "/Users/test/neon-rain/preview.png"
  }
]
"""

let themes = try JSONDecoder().decode([CodexTheme].self, from: Data(payload.utf8))
precondition(themes.map(\CodexTheme.id) == ["makima", "faye", "neon-rain"])
precondition(themes[2].name == "Neon Rain")
precondition(themes[2].previewPath.hasSuffix("neon-rain/preview.png"))
precondition(themes[2].source == "user")

print("Swift dynamic theme model contract passed")
