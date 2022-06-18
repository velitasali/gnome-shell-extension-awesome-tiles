/*
 * Copyright (C) 2021 Pim Snel
 * Copyright (C) 2021 Veli Tasalı
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

const { Gdk, Gio, GLib, GObject, Gtk } = imports.gi
const Gettext = imports.gettext
const ExtensionUtils = imports.misc.extensionUtils

const Me = ExtensionUtils.getCurrentExtension()
const Constants = Me.imports.constants
const Utils = Me.imports.utils

const Domain = Gettext.domain(Me.metadata.uuid)
const { gettext } = Domain

const PrefsWidget = GObject.registerClass({
  GTypeName: 'AwesomeTilesPrefsWidget',
  Template: Me.dir.get_child('prefs.ui').get_uri(),
  InternalChildren: [
    'gap_size',
    'gaps_between_windows',
    'align_window_to_center',
    'increase_gap_size',
    'decrease_gap_size',
    'tile_window_to_center',
    'tile_window_to_left',
    'tile_window_to_right',
    'tile_window_to_top',
    'tile_window_to_top_left',
    'tile_window_to_top_right',
    'tile_window_to_bottom',
    'tile_window_to_bottom_left',
    'tile_window_to_bottom_right',
  ]
}, class PrefsWidget extends Gtk.Box {
  _init(params = {}) {
    super._init(params)

    this._gap_size.set_range(0, Constants.GAP_SIZE_MAX)
    this._gap_size.set_increments(1, 1)

    this._shortcutWidgets = [
      this._align_window_to_center,
      this._increase_gap_size,
      this._decrease_gap_size,
      this._tile_window_to_center,
      this._tile_window_to_left,
      this._tile_window_to_right,
      this._tile_window_to_top,
      this._tile_window_to_top_left,
      this._tile_window_to_top_right,
      this._tile_window_to_bottom,
      this._tile_window_to_bottom_left,
      this._tile_window_to_bottom_right,
    ]

    this._settings = ExtensionUtils.getSettings()

    this._settings.bind(
      'gap-size',
      this._gap_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    )

    this._settings.bind(
      'enable-inner-gaps',
      this._gaps_between_windows,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )

    this._shortcutWidgets.forEach((widget) => {
      this._settings.connect("changed::" + widget.get_name(), () => {
        this._reloadShortcutWidget(widget)
      })
    })

    this._reloadShortcutWidgets()
  }

  _onAssignShortcut(widget) {
    const dialog = new ShortcutDialog(this._settings, widget.get_name())
    dialog.set_transient_for(this.get_root())
    dialog.present()
  }

  _reloadShortcutWidget(widget) {
    const shortcut = this._settings.get_strv(widget.get_name())
    widget.label = shortcut?.length > 0 ? shortcut[0] : gettext('Disabled');
  }

  _reloadShortcutWidgets() {
    this._shortcutWidgets.forEach(this._reloadShortcutWidget.bind(this))
  }
})

const ShortcutDialog = class {
  constructor(settings, shortcut) {
    this._builder = new Gtk.Builder()
    this._builder.add_from_file(GLib.build_filenamev([Me.path, 'prefs-shortcut-dialog.ui']))

    this.widget = this._builder.get_object('dialog')

    this._connectSettings(settings, shortcut)

    return this.widget
  }

  _connectSettings(settings, shortcut) {
    const eventController = this._builder.get_object('event-controller')
    eventController.connect('key-pressed', (_widget, keyval, keycode, state) => {
      let mask = state & Gtk.accelerator_get_default_mod_mask()
      mask &= ~Gdk.ModifierType.LOCK_MASK

      if (mask === 0 && keyval === Gdk.KEY_Escape) {
        this.widget.visible = false
        return Gdk.EVENT_STOP
      }

      if (keyval === Gdk.KEY_BackSpace) {
        settings.set_strv(shortcut, [])
        this.widget.close()
      } else if (Utils.isBindingValid({ mask, keycode, keyval }) && Utils.isAccelValid({ mask, keyval })) {
        const binding = Gtk.accelerator_name_with_keycode(
          null,
          keyval,
          keycode,
          mask
        )
        settings.set_strv(shortcut, [binding])
        this.widget.close()
      }

      return Gdk.EVENT_STOP
    })
  }
}

function init() {
  ExtensionUtils.initTranslations(Me.metadata.uuid)
}

function buildPrefsWidget() {
  return new PrefsWidget()
}
