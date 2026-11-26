#!/usr/bin/env bash

set -euo pipefail

# Debian trixie ships GNOME 48. Shell versions 45–51 stay supported by the
# extension; this container is only the local test desktop.
IMAGE_NAME="awesome-tiles-gnome"
CONTAINER_NAME="x11docker-gnome-dev"
EXTENSION_UUID="awesome-tiles@velitasali.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_PROJECT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="$HOST_PROJECT/${EXTENSION_UUID}.shell-extension"
project_tag="$(cksum <<<"$HOST_PROJECT")"
project_tag="${project_tag%% *}"
RELOAD_FLAG="${TMPDIR:-/tmp}/awesome-tiles-dev-reload.${project_tag}"
WATCHER_PIDFILE="${TMPDIR:-/tmp}/awesome-tiles-dev-watcher.${project_tag}.pid"
WATCHER_PID=""
CLEANED_UP=0

cd "$HOST_PROJECT" || {
    echo "Failed to change directory to project root: $HOST_PROJECT" >&2
    exit 1
}

function cleanup {
    local status=$?
    if [[ "$CLEANED_UP" == 1 ]]; then
        exit "$status"
    fi
    CLEANED_UP=1
    trap - EXIT INT TERM

    echo ""
    echo "Dev session ended. Cleaning up..."
    if [[ -n "${WATCHER_PID:-}" ]]; then
        pkill -P "$WATCHER_PID" 2>/dev/null || true
        kill "$WATCHER_PID" 2>/dev/null || true
    fi
    if [[ -f "$WATCHER_PIDFILE" ]]; then
        local old_pid
        old_pid="$(cat "$WATCHER_PIDFILE" 2>/dev/null || true)"
        if [[ -n "$old_pid" && "$old_pid" != "${WATCHER_PID:-}" ]]; then
            kill "$old_pid" 2>/dev/null || true
        fi
        rm -f "$WATCHER_PIDFILE"
    fi
    if docker ps -q -f "name=^/${CONTAINER_NAME}$" 2>/dev/null | grep -q .; then
        echo "Stopping container..."
        docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi
    rm -f "$RELOAD_FLAG"
    exit "$status"
}

trap cleanup EXIT INT TERM

function require-cmd {
    local cmd="$1"
    local hint="${2:-}"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: ${cmd} is required.${hint:+ ${hint}}" >&2
        exit 1
    fi
}

function run-yarn {
    if command -v corepack >/dev/null 2>&1; then
        corepack yarn "$@"
    elif command -v yarn >/dev/null 2>&1; then
        yarn "$@"
    elif command -v npx >/dev/null 2>&1; then
        npx --yes corepack yarn "$@"
    else
        echo "Error: yarn, corepack, or npx is required to build this extension." >&2
        exit 1
    fi
}

function ignore-event {
    local base
    base="$(basename "$1")"
    case "$base" in
        *~ | *.swp | *.swx | *.swo | *.tmp | .#* | 4913)
            return 0
            ;;
    esac
    return 1
}

function compile-translations {
    local po_file lang locale_dir count=0
    if [[ ! -d po ]]; then
        return 0
    fi

    rm -rf "$DEV_DIR/locale"
    shopt -s nullglob
    for po_file in po/*.po; do
        lang="$(basename "$po_file" .po)"
        locale_dir="$DEV_DIR/locale/${lang}/LC_MESSAGES"
        mkdir -p "$locale_dir" || return 1
        msgfmt "$po_file" -o "$locale_dir/${EXTENSION_UUID}.mo" || return 1
        count=$((count + 1))
    done
    shopt -u nullglob
    echo "Compiled ${count} translations."
}

function build-extension-folder {
    echo "[BUILD] Compiling extension..."
    run-yarn build || return 1
    if [[ ! -f build/extension.js || ! -d build/schemas ]]; then
        echo "Error: yarn build did not produce build/extension.js and build/schemas." >&2
        return 1
    fi
    echo "[BUILD] Compiling schemas..."
    glib-compile-schemas --strict build/schemas || return 1

    mkdir -p "$DEV_DIR"
    rsync -a --delete build/ "$DEV_DIR/" || return 1
    compile-translations || return 1
}

function container-is-running {
    docker ps -q -f "name=^/${CONTAINER_NAME}$" 2>/dev/null | grep -q .
}

function shell-is-running {
    docker exec "$CONTAINER_NAME" pgrep -x gnome-shell >/dev/null 2>&1
}

function restart-shell {
    local uid gid environ bus runtime output line
    uid="$(id -u)"
    gid="$(id -g)"

    # GNU tr treats \000 as NUL. A shell "\0" escape does not.
    environ="$(docker exec "$CONTAINER_NAME" bash -c 'pid=$(pgrep -n gnome-shell) || exit 1; tr "\000" "\n" < "/proc/${pid}/environ"')" || return 1
    bus=""
    runtime=""
    while IFS= read -r line; do
        case "$line" in
            DBUS_SESSION_BUS_ADDRESS=*) bus="${line#DBUS_SESSION_BUS_ADDRESS=}" ;;
            XDG_RUNTIME_DIR=*) runtime="${line#XDG_RUNTIME_DIR=}" ;;
        esac
    done <<<"$environ"
    if [[ -z "$bus" || -z "$runtime" ]]; then
        echo "Could not read the GNOME session bus from the container." >&2
        return 1
    fi

    output="$(docker exec --user "${uid}:${gid}" \
        -e "DBUS_SESSION_BUS_ADDRESS=${bus}" \
        -e "XDG_RUNTIME_DIR=${runtime}" \
        "$CONTAINER_NAME" \
        busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval \
        s 'Meta.restart("Restarting…", global.context)')" || {
        # A restart drops the session bus, so busctl can fail after it worked.
        if ! shell-is-running; then
            return 0
        fi
        return 1
    }

    if ! grep -qE '(^| )b true|\(bs\) true' <<<"$output"; then
        echo "Shell restart was refused:" >&2
        printf '%s\n' "$output" >&2
        return 1
    fi
}

function reload-running-session {
    if ! container-is-running; then
        return 0
    fi
    if ! shell-is-running; then
        echo "Shell is not up yet. It will load this build when it starts."
        return 0
    fi
    if restart-shell; then
        echo "GNOME Shell restarted."
        return 0
    fi

    echo "In-container restart failed. Starting a fresh session..."
    touch "$RELOAD_FLAG"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

function start-watcher {
    if [[ -f "$WATCHER_PIDFILE" ]]; then
        local old_pid
        old_pid="$(cat "$WATCHER_PIDFILE" 2>/dev/null || true)"
        if [[ -n "$old_pid" ]]; then
            kill "$old_pid" 2>/dev/null || true
        fi
    fi

    (
        # The parent EXIT trap would stop the container when this subshell ends.
        trap - EXIT INT TERM
        echo "[WATCHER] Monitoring src/ and po/..."
        if ! inotifywait -m -r -e close_write,create,delete,move --format '%w%f' src po |
            while read -r changed; do
                if ignore-event "$changed"; then
                    continue
                fi
                while read -r -t 0.5 _; do
                    :
                done
                echo "[CHANGE] Rebuilding."
                if ! build-extension-folder; then
                    echo "Build failed. The running session was left as it is." >&2
                    continue
                fi
                reload-running-session || true
            done; then
            echo "Watcher stopped." >&2
        fi
    ) &
    WATCHER_PID=$!
    echo "$WATCHER_PID" >"$WATCHER_PIDFILE"
}

REBUILD=false
X11_LANG_VAL=""

for arg in "$@"; do
    case "$arg" in
        rebuild)
            REBUILD=true
            ;;
        --lang=*)
            X11_LANG_VAL="${arg#*=}"
            ;;
        *)
            if [[ "$arg" =~ ^[a-z]{2}(_[A-Z]{2})?(\.[Uu][Tt][Ff]-?8)?$ ]]; then
                X11_LANG_VAL="$arg"
            else
                echo "Error: unknown argument: ${arg}" >&2
                echo "Usage: ./dev/start-dev.sh [rebuild] [--lang=LOCALE]" >&2
                exit 1
            fi
            ;;
    esac
done

require-cmd docker
require-cmd x11docker
require-cmd inotifywait "It is in the inotify-tools package."
require-cmd rsync
require-cmd msgfmt "It is in the gettext package."
require-cmd glib-compile-schemas "It is in the glib2.0 package."

if [[ "$REBUILD" == true ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rmi -f "$IMAGE_NAME" >/dev/null 2>&1 || true
fi
if [[ -z "$(docker images -q "$IMAGE_NAME" 2>/dev/null)" ]]; then
    docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
fi

if [[ ! -d node_modules ]]; then
    run-yarn install
fi
build-extension-folder
start-watcher

echo "Entering dev loop. Close the GNOME window to exit."
while true; do
    rm -f "$RELOAD_FLAG"
    echo "Starting x11docker..."

    X11_OPTS=(
        --name "$CONTAINER_NAME"
        --desktop
        --gpu
        --init=systemd
        --ipc=host
        --network=host
        --dbus
        --cap-default
        --home
        --size 1920x1080
    )
    [[ -n "$X11_LANG_VAL" ]] && X11_OPTS+=(--lang="$X11_LANG_VAL")

    DOCKER_OPTS=(
        --cap-add ALL
        --privileged
        --security-opt seccomp=unconfined
        --security-opt apparmor=unconfined
        -v "$DEV_DIR:/home/$(id -un)/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"
    )

    x11_status=0
    x11docker "${X11_OPTS[@]}" -- "${DOCKER_OPTS[@]}" -- "$IMAGE_NAME" gnome-shell || x11_status=$?

    if [[ -f "$RELOAD_FLAG" ]]; then
        echo "Restarting session..."
        continue
    fi
    if [[ "$x11_status" -ne 0 ]]; then
        echo "x11docker exited with status ${x11_status}." >&2
        exit "$x11_status"
    fi
    echo "GNOME window closed."
    break
done
