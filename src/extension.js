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
const { Meta, Shell, Clutter, GLib, Gio } = imports.gi

const Me = ExtensionUtils.getCurrentExtension()
const {
  GAP_SIZE_MAX,
  GAP_SIZE_INCREMENTS,
  TILING_STEPS_CENTER,
  TILING_STEPS_SIDE,
  TILING_SUCCESSIVE_TIMEOUT,
} = Me.imports.constants
const { parseTilingSteps } = Me.imports.utils

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
    this._windowAnimations = []
    this._osdGapChangedIcon = Gio.icon_new_for_string("view-grid-symbolic")

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
    this._osdGapChangedIcon.run_dispose()
    this._osdGapChangedIcon = null
    this._settings = null
    _shortcutsBindingIds.forEach((id) => Main.wm.removeKeybinding(id))
    _shortcutsBindingIds.length = 0
    this._windowAnimations.forEach(animation=>{
      animation.clone?.destroy()
      const actor = animation.actor
      if (actor) {
        actor.timeline?.run_dispose()
        actor.timeline = null
      }
    })
    this._windowAnimations = null
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

    window.unmaximize(Meta.MaximizeFlags.BOTH)
    window.move_frame(false, x, y)
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
    Main.osdWindowManager.show(-1,this._osdGapChangedIcon,
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

  _captureWindow(window_actor,rect) {
    return new Clutter.Actor({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
      content: window_actor.paint_to_content(null)
    })
  }

  // unmaximize without animation by hacking gsettings
  _unmaximizeWithoutAnimation(window,rect) {
    rect ??= window.get_frame_rect()
    const desktopSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' })
    const lastValue = desktopSettings.get_boolean("enable-animations")
    if (lastValue) desktopSettings.set_boolean("enable-animations",false)
    window.unmaximize(Meta.MaximizeFlags.BOTH)
    window.move_resize_frame(false, rect.x, rect.y, rect.width, rect.height)
    if (lastValue) desktopSettings.set_boolean("enable-animations",true)
  }

  // remove window actor's last animation (unmaximize / last ani)
  _removeWindowActorAnimation(window_actor) {
    return Promise.all([
      ['scale_x', 1],
      ['scale_y', 1],
      ['x', window_actor.x],
      ['y', window_actor.y]
    ].map(prop=>
        new Promise(resolve=>
          window_actor.ease_property(prop[0],prop[1],{
            duration: 1,
            onComplete: resolve
          })
        )
      )
    )
  }

  // give time to redraw it selfs to application
  _delayFrames(actor) {
    return new Promise(resolve=>{
      const timeline = actor.timeline = new Clutter.Timeline({ actor:actor,duration: 1000 })
      let count = 0
      timeline.connect("new-frame",()=>{
        if (++count<=5) return
        timeline.run_dispose()
        actor.timeline = null
        resolve()
      })
      timeline.start()
    })
  }

  async _setWindowRect(window, x, y, width, height, animate) {
    const innerRectBefore = window.get_frame_rect()
    const outterRectBefore = window.get_buffer_rect()
    const actor = window.get_compositor_private()
    const isMaximized = window.get_maximized()
    const lastAnimation = this._windowAnimations.find(item=>item.window === window)
    const thisAnimation = lastAnimation || {}
    let clone

    // unmaximize
    if (isMaximized) {
      clone = animate && this._captureWindow(actor,outterRectBefore)
      this._unmaximizeWithoutAnimation(window,innerRectBefore)
    }

    // reset all animations (last ani / unmaximize ani)
    if (animate && (isMaximized || lastAnimation)) {
      lastAnimation?.clone?.destroy()
      await this._removeWindowActorAnimation(actor)
    }

    // clone window, and resize meta window
    thisAnimation.clone = animate && (clone ??= this._captureWindow(actor,outterRectBefore))
    thisAnimation.window = window
    thisAnimation.actor = actor
    window.move_resize_frame(false, x, y, width, height)
    if (!animate) {
      return
    }
    if (!lastAnimation) this._windowAnimations.push(thisAnimation)

    // Calculate before size / position
    const cloneGoalScaleX = width/innerRectBefore.width
    const cloneGoalScaleY = height/innerRectBefore.height
    const actorInitScaleX = innerRectBefore.width/width
    const actorInitScaleY = innerRectBefore.height/height
    const decoLeftBefore  = (innerRectBefore.x-outterRectBefore.x)
    const decoTopBefore   = (innerRectBefore.y-outterRectBefore.y)

    // draw clone, and wait for real window finish drawn
    global.window_group.insert_child_above(clone,actor)
    actor.visible = false
    await this._delayFrames(actor)
    if (this._windowAnimations.find(item=>item.window === window).clone != clone) {
      clone.destroy()
      return
    }
    actor.visible = true

    // Recalculate after size / position (required for real window)
    const innerRectAfter = window.get_frame_rect()
    const outterRectAfter = window.get_buffer_rect()
    const decoLeftAfter  = (innerRectAfter.x-outterRectAfter.x)
    const decoTopAfter   = (innerRectAfter.y-outterRectAfter.y)

    // Set real window actor position
    actor.scale_x = actorInitScaleX
    actor.scale_y = actorInitScaleY
    actor.x = innerRectBefore.x - decoLeftAfter*actorInitScaleX
    actor.y = innerRectBefore.y - decoTopAfter*actorInitScaleY

    // Create animations
    clone.ease_property('opacity', 0, {
      duration: 300,
      mode: Clutter.AnimationMode.EASE_OUT_QUART,
      onComplete: async()=>{
        const nowAnimation = this._windowAnimations.find(item=>item.window === window)
        if (nowAnimation && nowAnimation.clone === clone) {
          nowAnimation?.clone?.destroy()
          this._windowAnimations.splice(this._windowAnimations.indexOf(nowAnimation),1)
        }
      }
    })
    for (const prop of [
      [actor, 'scale_x', 1],
      [actor, 'scale_y', 1],
      [actor, 'x', x-decoLeftAfter],
      [actor, 'y', y-decoTopAfter],
      [clone,'scale_x',cloneGoalScaleX],
      [clone,'scale_y',cloneGoalScaleY],
      [clone,'x',x-decoLeftBefore*cloneGoalScaleX],
      [clone,'y',y-decoTopBefore*cloneGoalScaleY]
    ]) {
      prop[0].ease_property(prop[1],prop[2],{
        duration: 300,
        mode: Clutter.AnimationMode.EASE_OUT_EXPO
      })
    }
  }

  _tileWindow(top, bottom, left, right) {
    const window = global.display.get_focus_window()
    if (!window) return

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
    const iteration = successive ? prev.iteration : 0
    const step = 1.0 - steps[iteration]

    const workArea = this._calculateWorkspaceArea(window)
    let { x, y, width, height } = workArea


    // Special case - when tiling to the center we want the largest size to
    // cover the whole available space
    if (center) {
      const monitor = window.get_monitor()
      const monitorGeometry = global.display.get_monitor_geometry(monitor)
      const isVertical = monitorGeometry.width < monitorGeometry.height
      const widthStep = isVertical ? step / 2 : step
      const heightStep = isVertical ? step : step / 2

      width -= width * widthStep
      height -= height * heightStep
      x += (workArea.width - width) / 2
      y += (workArea.height - height) / 2

    } else {
      if (left !== right) width -= width * step
      if (top !== bottom) height -= height * step
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
    this._setWindowRect(window, x, y, width, height, this._isWindowAnimationEnabled)

    this._previousTilingOperation =
      { windowId, top, bottom, left, right, time, iteration: iteration + 1 }
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
