#!/usr/bin/env bash

set -euo pipefail

if [[ "${UID}" == "0" ]]; then
    echo "This should not be run as root" >&2
    exit 101
fi

NAME="awesome-tiles@velitasali.com"
POT_FILE="po/awesome-tiles@velitasali.com.pot"

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

function build-extension {
    require-cmd glib-compile-schemas "It is in the glib2.0 package."
    run-yarn install
    run-yarn build
    if [[ ! -d build/schemas ]]; then
        echo "Error: build/schemas is missing after the build." >&2
        exit 1
    fi
    echo "Compiling schemas..."
    glib-compile-schemas --strict build/schemas
}

function pack-extension {
    local path base
    local -a extras=()
    local -a required=(
        extension.js
        metadata.json
        prefs.js
        prefs-shortcut-dialog.ui
        icon.svg
    )
    local req ts

    require-cmd gnome-extensions
    require-cmd msgfmt "It is in the gettext package."

    for req in "${required[@]}"; do
        if [[ ! -f "build/${req}" ]]; then
            echo "Error: build/${req} is missing." >&2
            exit 1
        fi
    done

    shopt -s nullglob
    for ts in src/*.ts; do
        [[ "$ts" == *.d.ts ]] && continue
        base="$(basename "$ts" .ts)"
        if [[ ! -f "build/${base}.js" ]]; then
            echo "Error: build/${base}.js is missing." >&2
            exit 1
        fi
    done

    if [[ ! -f LICENSE ]]; then
        echo "Error: LICENSE is missing." >&2
        exit 1
    fi

    for path in build/*; do
        base="$(basename "$path")"
        if [[ -d "$path" ]]; then
            if [[ "$base" != "schemas" ]]; then
                echo "Error: unexpected directory build/${base}. Nested files cannot be packed." >&2
                exit 1
            fi
            continue
        fi
        case "$base" in
            extension.js | metadata.json | prefs.js | stylesheet.css | stylesheet-dark.css | stylesheet-light.css)
                continue
                ;;
        esac
        extras+=(--extra-source="$base")
    done
    shopt -u nullglob

    if [[ ${#extras[@]} -eq 0 ]]; then
        echo "Error: no extra sources found in build/." >&2
        exit 1
    fi

    echo "Packing extension..."
    gnome-extensions pack build \
        --force \
        --podir="../po" \
        --extra-source="../LICENSE" \
        "${extras[@]}"
}

function restart-shell {
    if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
        echo "Cannot restart GNOME Shell automatically on Wayland. Log out and back in to apply changes."
        return 0
    fi

    echo "Restarting shell on X11..."
    if ! busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…", global.context)'; then
        echo "Could not restart GNOME Shell. Log out and back in to apply changes."
    fi
    echo "Done"
}

function usage {
    echo "Usage: ./install.sh COMMAND"
    echo "COMMAND:"
    echo "  local-install  install the extension in the user's home directory"
    echo "                 under ~/.local"
    echo "  zip            Creates a zip file of the extension"
    echo "  update-po      Update po files to match source files"
}

function update-po {
    local line target tmp po
    local -a js_files=()
    local -a ui_files=()
    local -a updated=()

    require-cmd xgettext "It is in the gettext package."
    require-cmd msgmerge "It is in the gettext package."
    if [[ ! -f po/POTFILES.in ]]; then
        echo "Error: po/POTFILES.in is missing." >&2
        exit 1
    fi

    # xgettext's JavaScript parser rejects TypeScript syntax, so extract
    # strings from the compiled build/*.js files listed via POTFILES.in.
    # Reference comments are rewritten to the .ts sources afterwards.
    # Those line numbers still refer to the compiled JavaScript.
    if [[ ! -d node_modules ]]; then
        run-yarn install
    fi
    run-yarn build

    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue

        if [[ "$line" == *.ts ]]; then
            target="build/${line#src/}"
            target="${target%.ts}.js"
            if [[ ! -f "$target" ]]; then
                echo "Error: ${line} maps to missing ${target}." >&2
                exit 1
            fi
            js_files+=("$target")
        elif [[ "$line" == *.ui || "$line" == *.glade ]]; then
            if [[ ! -f "$line" ]]; then
                echo "Error: POTFILES entry not found: ${line}" >&2
                exit 1
            fi
            ui_files+=("$line")
        else
            echo "Error: unsupported POTFILES entry: ${line}" >&2
            exit 1
        fi
    done < po/POTFILES.in

    if [[ ${#js_files[@]} -eq 0 && ${#ui_files[@]} -eq 0 ]]; then
        echo "Error: po/POTFILES.in has no files." >&2
        exit 1
    fi

    tmp="$(mktemp)"
    trap 'rm -f "$tmp" po/*.po.new' RETURN

    if [[ ${#js_files[@]} -gt 0 ]]; then
        xgettext --from-code=UTF-8 --language=JavaScript \
            --keyword=_ --keyword=ngettext:1,2 \
            --package-name="Awesome Tiles" \
            --output="$tmp" \
            "${js_files[@]}" || return 1
    fi
    if [[ ${#ui_files[@]} -gt 0 ]]; then
        if [[ -s "$tmp" ]]; then
            xgettext --from-code=UTF-8 --join-existing \
                --package-name="Awesome Tiles" \
                --output="$tmp" \
                "${ui_files[@]}" || return 1
        else
            xgettext --from-code=UTF-8 \
                --package-name="Awesome Tiles" \
                --output="$tmp" \
                "${ui_files[@]}" || return 1
        fi
    fi

    sed -i 's/charset=CHARSET/charset=UTF-8/' "$tmp" || return 1
    sed -i -E '/^#: /s#(^|[[:space:]])(\./)?build/([A-Za-z0-9._/-]+)\.js#\1src/\3.ts#g' "$tmp" || return 1

    shopt -s nullglob
    local merge_status=0
    for po in po/*.po; do
        if ! msgmerge --quiet --no-wrap --backup=none -o "${po}.new" "$po" "$tmp"; then
            merge_status=1
            break
        fi
        updated+=("$po")
    done
    shopt -u nullglob
    if [[ "$merge_status" -ne 0 ]]; then
        return 1
    fi

    if [[ ${#updated[@]} -gt 0 ]]; then
        for po in "${updated[@]}"; do
            mv "${po}.new" "$po"
            echo "Updated ${po}"
        done
    fi
    mv "$tmp" "$POT_FILE"
    trap - RETURN
    echo "Updated ${POT_FILE}"
}

case "${1:-}" in
    local-install)
        build-extension
        pack-extension
        gnome-extensions install --force "${NAME}.shell-extension.zip"
        if ! gnome-extensions enable "$NAME"; then
            echo "Could not enable ${NAME}. Enable it from Extensions."
        fi
        restart-shell
        ;;
    zip)
        build-extension
        pack-extension
        ;;
    update-po)
        update-po
        ;;
    *)
        usage >&2
        exit 1
        ;;
esac
