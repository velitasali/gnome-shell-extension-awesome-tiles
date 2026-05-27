#!/usr/bin/env bash

set -e

if [ "$UID" = "0" ]; then
    echo 'This should not be run as root'
    exit 101
fi

NAME=awesome-tiles\@velitasali.com

function pack-extension {
    echo "Packing extension..."
    gnome-extensions pack build \
        --force \
        --podir="../po" \
        --extra-source="constants.js" \
        --extra-source="prefs-utils.js" \
        --extra-source="utils.js" \
        --extra-source="windowMover.js" \
        --extra-source="linkedResize.js" \
        --extra-source="prefs-shortcut-dialog.ui" \
        --extra-source="icon.svg" \
        --extra-source="../LICENSE"
}

function compile-preferences {
    if [ -d src/resources ]; then
        echo 'Compiling resources...'
        glib-compile-resources --sourcedir=src/resources \
            --target=src/resources/prefs.gresource \
            src/resources/org.gnome.shell.extensions.awesome-tiles.prefs.gresource.xml
    else
        echo 'No resources to compile... Skipping'
    fi

    if [ -d src/schemas ]; then
        echo 'Compiling schemas...'
        glib-compile-schemas --targetdir=src/schemas src/schemas
    else
        echo 'No schemas to compile... Skipping'
    fi
}

function restart-shell {
    if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
        echo 'Cannot restart GNOME Shell automatically on Wayland. Please log out and log back in to apply changes.'
    else
        echo 'Restarting shell on X11...'
        busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…", global.context)'
    fi
    echo 'Done'
}

function usage() {
    echo 'Usage: ./install.sh COMMAND'
    echo 'COMMAND:'
    echo "  local-install  install the extension in the user's home directory"
    echo '                 under ~/.local'
    echo '  zip            Creates a zip file of the extension'
    echo '  update-po      Update po files to match source files'
}

function update-po() {
    echo '' > messages.po
    find ./src -type f \( -name "*.ui" -or -name "*.ts" \) | xgettext --language=JavaScript --from-code utf-8 -j messages.po -f -
    sed -i 's|"Content\-Type: text/plain; charset=CHARSET\\n"|"Content-Type: text/plain; charset=UTF-8\\n"|g' messages.po
    find ./po -type f -name "*.po" | xargs -i msgmerge {} messages.po -N --no-wrap -U
    mv messages.po $(find ./po -type f -name "*.pot")
}

case "$1" in
    "local-install" )
        compile-preferences
        yarn build
        pack-extension
        gnome-extensions install --force $NAME.shell-extension.zip && restart-shell
    ;;

    "zip" )
        compile-preferences
        yarn build
        pack-extension
    ;;

    "update-po" )
        update-po
    ;;

    * )
        usage
    ;;
esac
exit
