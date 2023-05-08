#!/usr/bin/env bash

set -e

if [ "$UID" = "0" ]; then
    echo 'This should not be run as root'
    exit 101
fi

NAME=awesome-tiles\@velitasali.com

function pack-extension {
    echo "Packing extension..."
    gnome-extensions pack src \
    --force \
    --podir="../po" \
    --extra-source="constants.js" \
    --extra-source="prefs.ui" \
    --extra-source="prefs-shortcut-dialog.ui" \
    --extra-source="utils.js" \
    --extra-source="windowMover.js" \
    --extra-source="../LICENSE"
}

function compile-preferences {
    if [ -d src/schemas ]; then
        echo 'Compiling preferences...'
        glib-compile-schemas --targetdir=src/schemas src/schemas
    else
        echo 'No preferences to compile... Skipping'
    fi
}

function restart-shell {
    echo 'Restarting shell...'
    busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…", global.context)'
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
    find ./src -type f \( -name "*.ui" -or -name "*.js" \) | xgettext --from-code utf-8 -j messages.po -f -
    sed -i 's|"Content\-Type: text/plain; charset=CHARSET\\n"|"Content-Type: text/plain; charset=UTF-8\\n"|g' messages.po
    find ./po -type f -name "*.po" | xargs -i msgmerge {} messages.po -N --no-wrap -U
    mv messages.po $(find ./po -type f -name "*.pot")
}

case "$1" in
    "local-install" )
        compile-preferences
        pack-extension
        gnome-extensions install --force $NAME.shell-extension.zip && restart-shell
    ;;
    
    "zip" )
        compile-preferences
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
