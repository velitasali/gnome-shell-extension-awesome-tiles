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

import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import Gio from 'gi://Gio'
import { Extension, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js'
import { osdWindowManager, wm } from 'resource:///org/gnome/shell/ui/main.js';
import * as windowMover from './windowMover.js';
import {
  GAP_SIZE_MAX,
  TILING_STEPS_CENTER,
  TILING_STEPS_SIDE,
} from './constants.js'
import { isRectEqual, parseTilingSteps } from  './utils.js'

export default class AwesomeTilesExtension extends Extension {
  enable() {
    this._windowMover = new windowMover.WindowMover()
    this._settings = this.getSettings()
    this._osdGapChangedIcon = Gio.icon_new_for_string("view-grid-symbolic")
    this._shortcutsBindingIds = []

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
    this._windowMover.destroy()
    this._shortcutsBindingIds.forEach((id) => wm.removeKeybinding(id))
    this._shortcutsBindingIds = this._settings = this._windowMover = this._osdGapChangedIcon = null
  }

  _alignWindowToCenter() {
    const window = global.display.get_focus_window()
    if (!window) return

    const windowArea = window.get_frame_rect()
    const monitor = window.get_monitor()
    const workspace = window.get_workspace()
    const workspaceArea = workspace.get_work_area_for_monitor(monitor)

    const x = Math.floor(
      workspaceArea.x + ((workspaceArea.width - windowArea.width) / 2),
    )
    const y = Math.floor(
      workspaceArea.y + ((workspaceArea.height - windowArea.height) / 2),
    )

    this._windowMover._setWindowRect(window, x, y, windowArea.width, windowArea.height, this._isWindowAnimationEnabled)
  }

  _bindShortcut(name, callback) {
    const mode = Shell.hasOwnProperty('ActionMode') ? Shell.ActionMode : Shell.KeyBindingMode

    wm.addKeybinding(
      name,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      mode.ALL,
      callback
    )

    this._shortcutsBindingIds.push(name)
  }

  _calculateWorkspaceArea(window) {
    const monitor = window.get_monitor()
    const monitorGeometry = global.display.get_monitor_geometry(monitor)
    const isVertical = monitorGeometry.width < monitorGeometry.height
  
    const workspace = window.get_workspace()
    const workspaceArea = workspace.get_work_area_for_monitor(monitor)
    const gap = this._gapSize

    
    if (gap <= 0) return {
      x: workspaceArea.x,
      y: workspaceArea.y,
      height: workspaceArea.height,
      width: workspaceArea.width,
    }
    
    const gapUncheckedX = Math.round(gap / 200 * workspaceArea.width)
    const gapUncheckedY = Math.round(gap / 200 * workspaceArea.height)
    
    const gaps = {
      x: Math.min(gapUncheckedX, gapUncheckedY * 2),
      y: Math.min(gapUncheckedY, gapUncheckedX * 2),
    }
    
    // If the monitor is vertical, swap the gap values
    if (isVertical) {
      const temp = gaps.x
      gaps.x = gaps.y
      gaps.y = temp
    }
    
    return {
      x: workspaceArea.x + gaps.x,
      y: workspaceArea.y + gaps.y,
      height: workspaceArea.height - (gaps.y * 2),
      width: workspaceArea.width - (gaps.x * 2),
      gaps,
    }
  }

  get _gapSizeIncrements() {
    return this._settings.get_int("gap-size-increments")
  }

  _decreaseGapSize() {
    this._gapSize = Math.max(this._gapSize - this._gapSizeIncrements, 0)
    this._notifyGapSize()
  }

  _increaseGapSize() {
    this._gapSize = Math.min(this._gapSize + this._gapSizeIncrements, GAP_SIZE_MAX)
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
    osdWindowManager.show(-1,this._osdGapChangedIcon,
      ngettext(
        'Gap size is now at %d percent',
        'Gap size is now at %d percent',
        gapSize
      ).format(gapSize),
      null,null,null
    )
  }

  get _isInnerGapsEnabled() {
    return this._settings.get_boolean("enable-inner-gaps")
  }

  get _tilingStepsCenter() {
    return parseTilingSteps(
      this._settings.get_string("tiling-steps-center"),
      TILING_STEPS_CENTER,
    )
  }

  get _tilingStepsSide() {
    return parseTilingSteps(
      this._settings.get_string("tiling-steps-side"),
      TILING_STEPS_SIDE,
    )
  }

  get _isWindowAnimationEnabled() {
    return this._settings.get_boolean("enable-window-animation")
  }

  get _nextStepTimeout() {
    return this._settings.get_int("next-step-timeout")
  }

  _tileWindow(top, bottom, left, right) {
    const window = global.display.get_focus_window()
    if (!window) return

    const { x, y, width, height } = this._nextWindowRect(window, top, bottom, left, right)

    this._windowMover._setWindowRect(window, x, y, width, height, this._isWindowAnimationEnabled)
  }

  _nextWindowRect(window, top, bottom, left, right) {
    const time = Date.now()
    const center = !(top || bottom || left || right)
    const prev = this._previousTilingOperation
    const windowId = window.get_id()
    const steps = center ? this._tilingStepsCenter : this._tilingStepsSide
    const successive =
      prev &&
      prev.windowId === windowId &&
      time - prev.time <= this._nextStepTimeout &&
      prev.top === top &&
      prev.bottom === bottom &&
      prev.left === left &&
      prev.right === right &&
      prev.iteration < steps.length
    let iteration = successive ? prev.iteration : 0
    let rect = this._computeWindowRect(window, top, bottom, left, right, steps[iteration], center)

    // Iterate through the tiling steps until we find one that changes the window size.
    for (const end = iteration; successive && isRectEqual(rect, prev.rect);) {
      iteration = (iteration + 1) % steps.length
      if (iteration === end)
        break;
      rect = this._computeWindowRect(window, top, bottom, left, right, steps[iteration], center)
    }

    this._previousTilingOperation =
      { windowId, top, bottom, left, right, rect, time, iteration: iteration + 1 }

    return rect
  }

  _computeWindowRect(window, top, bottom, left, right, step, center) {
    const widthFactor = 1.0 - step[0]
    const heightFactor = step.length > 1 ? (1.0 - step[1]) : widthFactor

    const workArea = this._calculateWorkspaceArea(window)
    let { x, y, width, height } = workArea

    // Special case - when tiling to the center we want the largest size to
    // cover the whole available space
    if (center) {
      const monitor = window.get_monitor()
      const monitorGeometry = global.display.get_monitor_geometry(monitor)
      const isVertical = monitorGeometry.width < monitorGeometry.height
      const centerTilingWidthFactor = isVertical ? widthFactor / 2 : widthFactor
      const centerTilingHeightFactor = isVertical ? heightFactor : heightFactor / 2

      width -= width * centerTilingWidthFactor
      height -= height * centerTilingHeightFactor
      x += (workArea.width - width) / 2
      y += (workArea.height - height) / 2

    } else {
      if (left !== right) width -= width * widthFactor
      if (top !== bottom) height -= height * heightFactor
      if (!left) x += (workArea.width - width) / (right ? 1 : 2)
      if (!top) y += (workArea.height - height) / (bottom ? 1 : 2)

      if (this._isInnerGapsEnabled && workArea.gaps !== undefined) {
        if (left !== right) {
          if (right) x += workArea.gaps.x / 2
          width -= workArea.gaps.x / 2
        }
        if (top !== bottom) {
          if (bottom) y += workArea.gaps.y / 2
          height -= workArea.gaps.y / 2
        }
      }
    }

    x = Math.round(x)
    y = Math.round(y)
    width = Math.round(width)
    height = Math.round(height)

    return { x, y, width, height }
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
