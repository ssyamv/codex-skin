#!/bin/zsh

script_dir="${0:A:h}"
bootstrap="$script_dir/scripts/command-bootstrap.zsh"
entrypoint="$script_dir/bin/codex-skin.mjs"
typeset -g CODEX_SKIN_THEME_NAME="Faye"

if [[ ! -r "$bootstrap" ]]; then
  print -u2 -r -- "无法停止 Codex Faye 主题：缺少启动组件 $bootstrap"
  print -u2 -r -- "请恢复完整的主题目录后重试；主题可能仍在运行。"
  [[ -t 0 ]] && read -r "?按回车键关闭窗口…" || true
  exit 1
fi

source "$bootstrap"

if [[ ! -r "$entrypoint" ]]; then
  print -u2 -r -- "无法停止 Codex Faye 主题：缺少程序文件 $entrypoint"
  print -u2 -r -- "请恢复完整的主题目录后重试；主题可能仍在运行。"
  codex_skin_pause_on_error
  exit 1
fi

if ! codex_skin_resolve_node; then
  codex_skin_print_node_error "停止"
  print -u2 -r -- "主题可能仍在运行，请勿直接删除主题目录。"
  codex_skin_pause_on_error
  exit 1
fi

"$CODEX_SKIN_NODE" "$entrypoint" stop --theme faye
exit_code=$?
if (( exit_code != 0 )); then
  print -u2 -r -- ""
  print -u2 -r -- "Codex Faye 主题停止失败（退出码 $exit_code）。主题可能仍在运行。"
  print -u2 -r -- "请保留本窗口中的错误信息，并在修复后重新执行停止操作。"
  codex_skin_pause_on_error
fi
exit "$exit_code"
