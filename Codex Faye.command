#!/bin/zsh

script_dir="${0:A:h}"
bootstrap="$script_dir/scripts/command-bootstrap.zsh"
entrypoint="$script_dir/bin/codex-skin.mjs"
typeset -g CODEX_SKIN_THEME_NAME="Faye"

if [[ ! -r "$bootstrap" ]]; then
  print -u2 -r -- "无法启动 Codex Faye 主题：缺少启动组件 $bootstrap"
  print -u2 -r -- "请重新下载完整的主题目录，不要单独移动此 .command 文件。"
  [[ -t 0 ]] && read -r "?按回车键关闭窗口…" || true
  exit 1
fi

source "$bootstrap"

if [[ ! -r "$entrypoint" ]]; then
  print -u2 -r -- "无法启动 Codex Faye 主题：缺少程序文件 $entrypoint"
  print -u2 -r -- "请重新下载完整的主题目录，不要单独移动此 .command 文件。"
  codex_skin_pause_on_error
  exit 1
fi

if ! codex_skin_resolve_node; then
  codex_skin_print_node_error "启动"
  codex_skin_pause_on_error
  exit 1
fi

"$CODEX_SKIN_NODE" "$entrypoint" start --theme faye
exit_code=$?
if (( exit_code != 0 )); then
  print -u2 -r -- ""
  print -u2 -r -- "Codex Faye 主题启动失败（退出码 $exit_code）。上方错误信息已保留。"
  print -u2 -r -- "诊断命令：\"$CODEX_SKIN_NODE\" \"$entrypoint\" doctor --theme faye"
  codex_skin_pause_on_error
fi
exit "$exit_code"
