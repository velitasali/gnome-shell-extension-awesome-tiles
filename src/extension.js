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

const ExtensionUtils = imports.misc.extensionUtils
const Gettext = imports.gettext
const Main = imports.ui.main
const { Meta, Shell } = imports.gi

const Me = ExtensionUtils.getCurrentExtension()
const Constants = Me.imports.constants

const Domain = Gettext.domain(Me.metadata.uuid)
const { ngettext } = Domain

const _shortcutsBindingIds = []

function init() {
  ExtensionUtils.initTranslations(Me.metadata.uuid)
  return new Extension()
}

class Extension {
  enable() {
    this._settings = ExtensionUtils.getSettings()

    this._bindShortcut("shortcut-align-window-to-center", this._alignWindowToCenter.bind(this))
    this._bindShortcut("shortcut-tile-window-to-center", this._tileWindowCenter.bind(this))
    this._bindShortcut("shortcut-tile-window-to-left", this._tileWindowLeft.bind(this))
    this._bindShortcut("shortcut-tile-window-to-right", this._tileWindowRight.bind(this))
    this._bindShortcut("shortcut-tile-window-to-top", this._tileWindowTop.bind(this))
    this._bindShortcut("shortcut-tile-window-to-top-left", this._tileWindowTopLeft.bind(this))
    this._bindShortcut("shortcut-tile-window-to-top-right", this._tileWindowTopRight.bind(this))
    this._bindShortcut("shortcut-tile-window-to-bottom", this._tileWindowBottom.bind(this))
    this._bindShortcut("shortcut-tile-window-to-bottom-left", this._tileWindowBottomLeft.bind(this))
    this._bindShortcut("shortcut-tile-window-to-bottom-right", this._tileWindowBottomRight.bind(this))
    this._bindShortcut("shortcut-increase-gap-size", this._increaseGapSize.bind(this))
    this._bindShortcut("shortcut-decrease-gap-size", this._decreaseGapSize.bind(this))
  }

  disable() {
    this._settings = null
    _shortcutsBindingIds.forEach((id) => Main.wm.removeKeybinding(id))
    _shortcutsBindingIds.length = 0
  }

  _alignWindowToCenter() {
    const window = global.display.get_focus_window()
    if (!window) return

    const windowArea = window.get_frame_rect()
    const monitor = window.get_monitor()
    const workspace = window.get_workspace()
    const workspaceArea = workspace.get_work_area_for_monitor(monitor)

    const x = workspaceArea.x + ((workspaceArea.width - windowArea.width) / 2)
    const y = workspaceArea.y + ((workspaceArea.height - windowArea.height) / 2)

    window.unmaximize(Meta.MaximizeFlags.BOTH)
    window.move_resize_frame(false, x, y, windowArea.width, windowArea.height)
  }

  _bindShortcut(name, callback) {
    const mode = Shell.hasOwnProperty('ActionMode') ? Shell.ActionMode : Shell.KeyBindingMode

    Main.wm.addKeybinding(
      name,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      mode.ALL,
      callback
    )

    _shortcutsBindingIds.push(name)
  }

  _calculateWorkspaceArea(window) {
    const monitor = window.get_monitor()
    const workspace = window.get_workspace()
    const workspaceArea = workspace.get_work_area_for_monitor(monitor)
    const gap = this._gapSize

    if (gap <= 0) return {
      x: workspaceArea.x,
      y: workspaceArea.y,
      h: workspaceArea.height,
      w: workspaceArea.width,
    }

    const gapUncheckedX = Math.round(gap / 200 * workspaceArea.width)
    const gapUncheckedY = Math.round(gap / 200 * workspaceArea.height)

    const gaps = {
      x: Math.min(gapUncheckedX, gapUncheckedY * 2),
      y: Math.min(gapUncheckedY, gapUncheckedX * 2),
    }

    return {
      x: workspaceArea.x + gaps.x,
      y: workspaceArea.y + gaps.y,
      h: workspaceArea.height - (gaps.y * 2),
      w: workspaceArea.width - (gaps.x * 2),
      gaps,
    }
  }

  _decreaseGapSize() {
    if (this._gapSize > 0) {
      this._gapSize = Math.max(this._gapSize - Constants.GAP_SIZE_INCREMENTS, 0)
    }
    this._notifyGapSize()
  }

  _increaseGapSize() {
    if (this._gapSize < Constants.GAP_SIZE_MAX) {
      this._gapSize = Math.min(this._gapSize + Constants.GAP_SIZE_INCREMENTS, Constants.GAP_SIZE_MAX)
    }
    this._notifyGapSize()
  }

  get _gapSize() {
    return this._settings.get_int("gap-size")
  }

  set _gapSize(intValue) {
    this._settings.set_int("gap-size", intValue)
  }

  _notifyGapSize() {
    const gapSize = this._gapSize
    Main.notify(
      Me.metadata.name,
      ngettext(
        'Gap size is now at %d percent',
        'Gap size is now at %d percent',
        gapSize
      ).format(gapSize)
    )
  }

  get _isInnerGapsEnabled() {
    return this._settings.get_boolean("enable-inner-gaps")
  }

  _tileWindow(top, bottom, left, right) {
    const window = global.display.get_focus_window()
    if (!window) return

    const prev = this._previousTilingOperation
    const windowId = window.get_id()
    const successive = prev && prev.id == windowId && prev.t == top && prev.b == bottom
      && prev.l == left && prev.r == right
    const secondIteration = successive && prev.second

    const gridSize = successive ? 3 : 2
    const gridSpanBase = !successive || secondIteration ? 1 : 2
    const gridSpanX = left && right ? gridSize : gridSpanBase
    const gridSpanY = top && bottom ? gridSize : gridSpanBase

    const workArea = this._calculateWorkspaceArea(window)

    // Special case - when tiling to the center we want the largest size to cover the whole available space
    const centerFactor = !(top || bottom || left || right) ? 1.5 : 1;

    let w = gridSize == gridSpanX ? workArea.w : Math.round(workArea.w * centerFactor / gridSize) * gridSpanX
    let h = gridSize == gridSpanY ? workArea.h : Math.round(workArea.h * centerFactor / gridSize) * gridSpanY
    let x = workArea.x + (left ? 0 : right ? workArea.w - w : (workArea.w - w) / 2)
    let y = workArea.y + (top ? 0 : bottom? workArea.h - h : (workArea.h - h) / 2)

    if (this._isInnerGapsEnabled && workArea.gaps !== undefined) {
      if (left !== right) {
        if (right) x += workArea.gaps.x / 2;
        w -= workArea.gaps.x / 2;
      }
      if (top !== bottom) {
        if (bottom) y += workArea.gaps.y / 2;
        h -= workArea.gaps.y / 2;
      }
    }

    window.unmaximize(Meta.MaximizeFlags.BOTH)
    window.move_resize_frame(false, x, y, w, h)

    this._previousTilingOperation = secondIteration ? undefined : {
      id: windowId, t: top, b: bottom, l: left, r: right, second: successive && !secondIteration
    }
  }

  _tileWindowBottom() {
    this._tileWindow(false, true, true, true)
  }

  _tileWindowBottomLeft() {
    this._tileWindow(false, true, true, false)
  }

  _tileWindowBottomRight() {
    this._tileWindow(false, true, false, true)
  }

  _tileWindowCenter() {
    this._tileWindow(false, false, false, false)
  }

  _tileWindowLeft() {
    this._tileWindow(true, true, true, false)
  }

  _tileWindowRight() {
    this._tileWindow(true, true, false, true)
  }

  _tileWindowTop() {
    this._tileWindow(true, false, true, true)
  }

  _tileWindowTopLeft() {
    this._tileWindow(true, false, true, false)
  }

  _tileWindowTopRight() {
    this._tileWindow(true, false, false, true)
  }
}
