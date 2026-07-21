#!/bin/zsh

# Shared bootstrap for the two Finder-facing .command launchers.

typeset -g CODEX_SKIN_THEME_NAME="${CODEX_SKIN_THEME_NAME:-玛奇玛}"

typeset -g CODEX_SKIN_NODE=""
typeset -ga CODEX_SKIN_NODE_DIAGNOSTICS=()

codex_skin_resolve_node() {
  local path_node candidate version major existing duplicate
  local -a candidates=()

  path_node="$(whence -p node 2>/dev/null || true)"
  [[ -n "$path_node" ]] && candidates+=("$path_node")
  candidates+=("/opt/homebrew/bin/node" "/usr/local/bin/node")

  CODEX_SKIN_NODE=""
  CODEX_SKIN_NODE_DIAGNOSTICS=()

  for candidate in "${candidates[@]}"; do
    duplicate=0
    for existing in "${CODEX_SKIN_NODE_DIAGNOSTICS[@]}"; do
      [[ "$existing" == "$candidate"* ]] && duplicate=1 && break
    done
    (( duplicate )) && continue

    if [[ ! -x "$candidate" ]]; then
      CODEX_SKIN_NODE_DIAGNOSTICS+=("$candidate：不存在或不可执行")
      continue
    fi

    version="$("$candidate" -p 'process.versions.node' 2>/dev/null)" || {
      CODEX_SKIN_NODE_DIAGNOSTICS+=("$candidate：无法读取版本")
      continue
    }
    major="${version%%.*}"
    if [[ -z "$major" || "$major" == *[^0-9]* ]]; then
      CODEX_SKIN_NODE_DIAGNOSTICS+=("$candidate：无法识别版本 $version")
      continue
    fi
    if (( 10#$major < 22 )); then
      CODEX_SKIN_NODE_DIAGNOSTICS+=("$candidate：Node.js $version，版本低于 22")
      continue
    fi

    CODEX_SKIN_NODE="$candidate"
    return 0
  done

  return 1
}

codex_skin_print_node_error() {
  local action="$1" item

  print -u2 -r -- "无法${action} Codex ${CODEX_SKIN_THEME_NAME} 主题：需要 Node.js 22 或更高版本。"
  print -u2 -r -- "已检查当前 PATH、/opt/homebrew/bin/node 和 /usr/local/bin/node："
  for item in "${CODEX_SKIN_NODE_DIAGNOSTICS[@]}"; do
    print -u2 -r -- "  - $item"
  done
  print -u2 -r -- "请安装或升级 Node.js 后重新双击此文件。"
}

codex_skin_pause_on_error() {
  print -u2 -r -- ""
  if [[ -t 0 ]]; then
    read -r "?按回车键关闭窗口…" || true
  fi
}
