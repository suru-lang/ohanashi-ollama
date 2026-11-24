#!/bin/sh
# 起動.sh: ohanashi-ollama を作って動かし、頼まれたら最新にして作り直し、動かし直す
#
#   ./起動.sh [--watch 秒] [--] [ohanashi-ollama の引数…]
#
# - 画面の ⚙ の「最新にして再起動」を押すと、git pull → kumu 作る → 動かし直す、をします。
# - --watch 秒 を付けると、その秒ごとに git fetch して、追っている枝(main など)に
#   新しいコミットがあれば、同じように更新します(マージしたら手元のアプリが新しくなる)。
# - 作り直しに失敗したときは、前のアプリを動かしたままにして、画面に理由を出します。
# - Ctrl-C で、アプリといっしょに止まります。
#
# 起動.sh とアプリは 出力/制御 のフォルダで話します。アプリは「再起動」のファイルを置き、
# 起動.sh はそれを見て更新し、様子(「更新中」や「失敗: …」)を「状態」に書きます。

set -u
cd "$(dirname "$0")" || exit 1

WATCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --watch)
      [ $# -ge 2 ] || { echo "--watch の後ろに秒がありません" >&2; exit 2; }
      WATCH="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
case "$WATCH" in ''|*[!0-9]*) echo "--watch には秒(整数)を書いてください: $WATCH" >&2; exit 2 ;; esac

CTRL=出力/制御
STATE="$CTRL/状態"
REQUEST="$CTRL/再起動"
APP=出力/ohanashi-ollama
PID=
FAILED=

mkdir -p "$CTRL"
rm -f "$REQUEST"

log() { printf '[起動.sh] %s\n' "$*" >&2; }
state() { printf '%s\n' "$*" > "$STATE"; }

# git の中で、追っている枝があるときだけ更新する
tracking() { git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; }
revision() { git rev-parse --short HEAD 2>/dev/null || true; }

start_app() {
  "$APP" --control "$CTRL" --revision "$(revision)" "$@" &
  PID=$!
  log "動かしました(pid $PID、版 $(revision))"
}

stop_app() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
    PID=
  fi
}

trap 'stop_app; exit 0' INT TERM

# git pull と kumu 作る。失敗したら 状態 に理由を書いて 1 を返す
update() {
  state "更新中"
  if tracking; then
    if ! out=$(git pull --ff-only 2>&1); then
      printf '%s\n' "$out" >&2
      state "失敗: git pull に失敗しました($(printf '%s' "$out" | tail -n 1))"
      return 1
    fi
  fi
  if ! kumu 作る >&2; then
    state "失敗: kumu 作る に失敗しました(起動.sh の画面を見てください)"
    return 1
  fi
  state ""
}

# 追っている枝に、手元にないコミットがあれば 真
behind() {
  tracking || return 1
  git fetch -q 2>/dev/null || return 1
  up=$(git rev-parse '@{u}')
  [ "$up" != "$FAILED" ] || return 1
  ! git merge-base --is-ancestor "$up" HEAD
}

# git pull でこのファイルが変わっても困らないように、全体を関数にしてから動かす
# (起動.sh そのものの変更は、起動.sh を動かし直したときに効きます)
main() {
  if ! update; then
    log "$(cat "$STATE")"
    [ -x "$APP" ] || exit 1
    log "前に作ったアプリを動かします"
  fi
  start_app "$@"

  last=$(date +%s)
  while :; do
    sleep 2
    if ! kill -0 "$PID" 2>/dev/null; then
      wait "$PID"; rc=$?
      log "アプリが終わりました(終了コード $rc)"
      exit "$rc"
    fi
    why=
    if [ -f "$REQUEST" ]; then
      rm -f "$REQUEST"; why="画面から頼まれた"
    elif [ "$WATCH" -gt 0 ] && [ $(( $(date +%s) - last )) -ge "$WATCH" ]; then
      last=$(date +%s)
      if behind; then why="新しいコミットがある"; fi
    fi
    [ -n "$why" ] || continue
    log "${why}ので、最新にして作り直します"
    if update; then
      FAILED=
      stop_app
      start_app "$@"
    else
      tracking && FAILED=$(git rev-parse '@{u}')
      log "$(cat "$STATE")。前のアプリを動かしたままにします"
    fi
  done
}

main "$@"; exit $?
