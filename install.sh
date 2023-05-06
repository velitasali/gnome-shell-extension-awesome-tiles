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
    
    * )
        usage
    ;;
esac
exit
