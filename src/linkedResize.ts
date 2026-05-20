/*
 * Copyright (C) 2021 Pim Snel (https://github.com/mipmip)
 * Copyright (C) 2021 Veli Tasalı (https://github.com/velitasali)
 * Copyright (C) 2026 Samet Güzeldemirci (https://github.com/samex)
 *
 * Contributors:
 * - qwreey (https://github.com/qwreey)
 * - mhecher-sc (https://github.com/mhecher-sc)
 * - FedericoCalzoni (https://github.com/FedericoCalzoni)
 * - Dolland (https://github.com/Dolland)
 * - Vistaus (https://github.com/Vistaus)
 * - nushoin (https://github.com/nushoin)
 * - lazydays79 (https://github.com/lazydays79)
 * - guillaumecle (https://github.com/guillaumecle)
 * - Chake96 (https://github.com/Chake96)
 * - Soupolait (https://github.com/Soupolait)
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

import Meta from "gi://Meta";
import Clutter from "gi://Clutter";
import St from "gi://St";
import GLib from "gi://GLib";
import Mtk from "gi://Mtk";
import Gio from "gi://Gio";

const GLOW_OPACITY = 0.75;
const GLOW_WIDTH = 5;
const GLOW_ANIMATION_DURATION = 300;

type ResizeDirection = "east" | "west" | "north" | "south";

interface SimpleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LinkedWindowInfo {
  window: Meta.Window;
  initialRect: Mtk.Rectangle;
}

interface ResizeInfo {
  window: Meta.Window;
  direction: ResizeDirection;
  initialRect: Mtk.Rectangle;
  linkedWindows: LinkedWindowInfo[];
  glow?: {
    actor: St.Widget;
    direction: ResizeDirection;
  };
}

export class LinkedResizeHandler {
  private enabled = false;
  private isResizing = false;
  private resizeInfo: ResizeInfo | null = null;
  private glowActor: St.Widget | null = null;
  private grabOpBeginId = 0;
  private grabOpEndId = 0;
  private capturedEventId = 0;
  private settingsChangedId: number | null = null;
  private modifierSettingsId: number | null = null;
  private resizeTimerId = 0;
  private modifierMask = Clutter.ModifierType.MOD1_MASK;

  constructor(private readonly settings: Gio.Settings) {}

  enable() {
    if (this.settingsChangedId) return;

    this.updateEnabled();
    this.updateModifierMask();

    this.settingsChangedId = this.settings.connect("changed::enable-linked-resize", () => {
      this.updateEnabled();
    });
    this.modifierSettingsId = this.settings.connect("changed::shortcut-linked-resize", () => {
      this.updateModifierMask();
    });
  }

  disable() {
    this.stopResize();

    if (this.settingsChangedId) {
      this.settings.disconnect(this.settingsChangedId);
      this.settingsChangedId = null;
    }

    if (this.modifierSettingsId) {
      this.settings.disconnect(this.modifierSettingsId);
      this.modifierSettingsId = null;
    }

    if (this.grabOpBeginId) {
      global.display.disconnect(this.grabOpBeginId);
      this.grabOpBeginId = 0;
    }

    if (this.grabOpEndId) {
      global.display.disconnect(this.grabOpEndId);
      this.grabOpEndId = 0;
    }

    if (this.capturedEventId) {
      global.stage.disconnect(this.capturedEventId);
      this.capturedEventId = 0;
    }

    if (this.resizeTimerId) {
      GLib.Source.remove(this.resizeTimerId);
      this.resizeTimerId = 0;
    }

    this.enabled = false;
  }

  private updateEnabled() {
    const shouldEnable = this.settings.get_boolean("enable-linked-resize");

    if (shouldEnable === this.enabled) return;

    this.enabled = shouldEnable;

    if (this.enabled) {
      this.grabOpBeginId = global.display.connect(
        "grab-op-begin",
        (_display: unknown, window: Meta.Window, grabOp: Meta.GrabOp) => {
          this.onGrabOpBegin(window, grabOp);
        },
      );

      this.grabOpEndId = global.display.connect(
        "grab-op-end",
        (_display: unknown, window: Meta.Window, grabOp: Meta.GrabOp) => {
          this.onGrabOpEnd(window, grabOp);
        },
      );

      this.capturedEventId = global.stage.connect(
        "captured-event",
        (_actor: unknown, event: Clutter.Event) => {
          return this.onCapturedEvent(event);
        },
      );
    } else {
      if (this.grabOpBeginId) {
        global.display.disconnect(this.grabOpBeginId);
        this.grabOpBeginId = 0;
      }
      if (this.grabOpEndId) {
        global.display.disconnect(this.grabOpEndId);
        this.grabOpEndId = 0;
      }
      if (this.capturedEventId) {
        global.stage.disconnect(this.capturedEventId);
        this.capturedEventId = 0;
      }
    }
  }

  private updateModifierMask() {
    const shortcuts = this.settings.get_strv("shortcut-linked-resize");
    if (!shortcuts || shortcuts.length === 0) {
      this.modifierMask = Clutter.ModifierType.MOD1_MASK;
      return;
    }

    const shortcut = shortcuts[0].toLowerCase();
    let mask = 0;

    if (shortcut.includes("alt")) mask |= Clutter.ModifierType.MOD1_MASK;
    if (shortcut.includes("super")) mask |= Clutter.ModifierType.SUPER_MASK;
    if (shortcut.includes("control") || shortcut.includes("ctrl"))
      mask |= Clutter.ModifierType.CONTROL_MASK;
    if (shortcut.includes("shift")) mask |= Clutter.ModifierType.SHIFT_MASK;

    this.modifierMask = mask || Clutter.ModifierType.MOD1_MASK;
  }

  private onCapturedEvent(event: Clutter.Event) {
    const type = event.type();

    if (type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE) {
      const isPressed = type === Clutter.EventType.KEY_PRESS;
      const mods = event.get_state();

      // We check if the current modifier state matches our expected mask
      // and also handle the case where the key itself is being pressed/released
      const isModifierEvent = (mods & this.modifierMask) !== 0 || this.isEventModifier(event);

      if (isModifierEvent) {
        if (!isPressed && this.isResizing) {
          this.stopResize();
        }
      }
    }

    return Clutter.EVENT_PROPAGATE;
  }

  private isEventModifier(event: Clutter.Event): boolean {
    const symbol = event.get_key_symbol();
    if (this.modifierMask & Clutter.ModifierType.MOD1_MASK) {
      if (symbol === Clutter.KEY_Alt_L || symbol === Clutter.KEY_Alt_R) return true;
    }
    if (this.modifierMask & Clutter.ModifierType.SUPER_MASK) {
      if (symbol === Clutter.KEY_Super_L || symbol === Clutter.KEY_Super_R) return true;
    }
    if (this.modifierMask & Clutter.ModifierType.CONTROL_MASK) {
      if (symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) return true;
    }
    if (this.modifierMask & Clutter.ModifierType.SHIFT_MASK) {
      if (symbol === Clutter.KEY_Shift_L || symbol === Clutter.KEY_Shift_R) return true;
    }
    return false;
  }

  private onGrabOpBegin(window: Meta.Window | null, grabOp: Meta.GrabOp) {
    const [_x, _y, mods] = global.get_pointer();
    const isModifierHeld = (mods & this.modifierMask) !== 0;

    if (!isModifierHeld) return;
    if (!window) return;

    const isResizeOp = [
      Meta.GrabOp.RESIZING_N,
      Meta.GrabOp.RESIZING_S,
      Meta.GrabOp.RESIZING_E,
      Meta.GrabOp.RESIZING_W,
    ].includes(grabOp);

    if (!isResizeOp) return;

    const direction = this.getResizeDirection(grabOp);
    if (!direction) return;

    const linkedWindows = this.findLinkedWindows(window, direction);
    if (linkedWindows.length === 0) return;

    this.isResizing = true;
    this.resizeInfo = {
      window: window,
      direction: direction,
      initialRect: window.get_frame_rect(),
      linkedWindows: linkedWindows.map((w: Meta.Window) => ({
        window: w,
        initialRect: w.get_frame_rect(),
      })),
    };

    this.createGlowEffect(window, direction, linkedWindows);
    this.startResizeTracking();
  }

  private startResizeTracking() {
    this.resizeTimerId = GLib.timeout_add(GLib.PRIORITY_LOW, 16, () => {
      if (!this.isResizing) {
        this.resizeTimerId = 0;
        return GLib.SOURCE_REMOVE;
      }
      this.syncLinkedWindows();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private onGrabOpEnd(_window: Meta.Window | null, _grabOp: Meta.GrabOp) {
    if (!this.isResizing) return;
    this.stopResize();
  }

  private getResizeDirection(grabOp: Meta.GrabOp): ResizeDirection | null {
    switch (grabOp) {
      case Meta.GrabOp.RESIZING_E:
        return "east";
      case Meta.GrabOp.RESIZING_W:
        return "west";
      case Meta.GrabOp.RESIZING_N:
        return "north";
      case Meta.GrabOp.RESIZING_S:
        return "south";
      default:
        return null;
    }
  }

  private findLinkedWindows(sourceWindow: Meta.Window, direction: ResizeDirection): Meta.Window[] {
    const workspace = sourceWindow.get_workspace();
    const monitor = sourceWindow.get_monitor();
    const sourceRect = sourceWindow.get_frame_rect();
    const sourceRectObj = {
      x: sourceRect.x,
      y: sourceRect.y,
      width: sourceRect.width,
      height: sourceRect.height,
    };

    const allWindows = workspace.list_windows();
    const winCount = allWindows.length;

    const sourceWindowId = sourceWindow.get_id();
    const passed = [];

    for (let i = 0; i < winCount; i++) {
      const w = allWindows[i];

      if (!w.get_id || typeof w.get_id !== "function") {
        continue;
      }

      const wid = w.get_id();

      if (wid === sourceWindowId) {
        continue;
      }

      if (this.isWindowMinimized(w)) {
        continue;
      }

      if (w.get_monitor() !== monitor) {
        continue;
      }

      const frameRect = w.get_frame_rect();
      const frameRectObj = {
        x: frameRect.x,
        y: frameRect.y,
        width: frameRect.width,
        height: frameRect.height,
      };

      const atEdge = this.isWindowAtEdge(sourceRectObj, frameRectObj, direction, sourceWindow);

      if (atEdge) {
        passed.push(w);
      }
    }

    const filtered = this.filterVisibleWindows(passed, sourceWindow, direction);
    return filtered;
  }

  private isWindowAtEdge(
    sourceRect: SimpleRect,
    targetRect: SimpleRect,
    direction: ResizeDirection,
    sourceWindow: Meta.Window,
  ): boolean {
    const threshold = this.calculateEdgeThreshold(sourceWindow);

    switch (direction) {
      case "east": {
        const edgeDist = Math.abs(targetRect.x - (sourceRect.x + sourceRect.width));
        const vOverlap = this.hasVerticalOverlap(sourceRect, targetRect);
        return edgeDist <= threshold && vOverlap;
      }
      case "west": {
        const edgeDist = Math.abs(targetRect.x + targetRect.width - sourceRect.x);
        const vOverlap = this.hasVerticalOverlap(sourceRect, targetRect);
        return edgeDist <= threshold && vOverlap;
      }
      case "south": {
        const edgeDist = Math.abs(targetRect.y - (sourceRect.y + sourceRect.height));
        const hOverlap = this.hasHorizontalOverlap(sourceRect, targetRect);
        return edgeDist <= threshold && hOverlap;
      }
      case "north": {
        const edgeDist = Math.abs(targetRect.y + targetRect.height - sourceRect.y);
        const hOverlap = this.hasHorizontalOverlap(sourceRect, targetRect);
        return edgeDist <= threshold && hOverlap;
      }
    }
    return false;
  }

  private calculateEdgeThreshold(sourceWindow: Meta.Window): number {
    const useIndividualGaps = this.settings.get_boolean("enable-individual-gap-sizes");
    const useInnerGaps = this.settings.get_boolean("enable-inner-gaps");
    const isPixels = this.settings.get_boolean("gap-size-in-pixels");

    let gapSize;
    if (useIndividualGaps && useInnerGaps) {
      gapSize = this.settings.get_int("gap-size-inner");
    } else {
      gapSize = this.settings.get_int("gap-size");
    }

    let gapPixels;
    if (isPixels) {
      gapPixels = gapSize;
    } else {
      const monitor = sourceWindow.get_monitor();
      const monitorGeometry = global.display.get_monitor_geometry(monitor);

      gapPixels = Math.round(
        (gapSize / 100) * Math.min(monitorGeometry.width, monitorGeometry.height),
      );
    }

    const threshold = Math.round(gapPixels * 1.5);

    return Math.max(threshold, 2);
  }

  private hasVerticalOverlap(a: SimpleRect, b: SimpleRect): boolean {
    return !(a.y + a.height <= b.y || b.y + b.height <= a.y);
  }

  private hasHorizontalOverlap(a: SimpleRect, b: SimpleRect): boolean {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x);
  }

  private isWindowMinimized(window: Meta.Window | null): boolean {
    // Multiple checks to detect minimized/hidden windows
    if (!window) return true;

    // Standard minimized check
    if (window.minimized) return true;

    // Check if window is hidden
    if (window.is_hidden()) return true;

    // Check if window is on the same workspace
    if (window.get_workspace() !== global.workspace_manager.get_active_workspace()) {
      // Window is on different workspace - treat as minimized
      return true;
    }

    // Check if window is mapped (visible)
    if (!window.mapped) return true;

    // Check show on all workspaces
    if (!window.is_on_all_workspaces()) {
      // Additional check for workspace
      if (window.get_workspace() !== global.workspace_manager.get_active_workspace()) {
        return true;
      }
    }

    return false;
  }

  private filterVisibleWindows(
    windows: Meta.Window[],
    sourceWindow: Meta.Window,
    direction: ResizeDirection,
  ): Meta.Window[] {
    const workspace = sourceWindow.get_workspace();
    const allWindows = workspace.list_windows();
    const sourceRect = sourceWindow.get_frame_rect();

    return windows.filter((w) => {
      const wRect = w.get_frame_rect();
      const sourceIdx = allWindows.indexOf(sourceWindow);
      const wIdx = allWindows.indexOf(w);

      for (const other of allWindows) {
        if (other === w || other === sourceWindow) continue;
        if (!other.get_id || typeof other.get_id !== "function") continue;

        if (this.isWindowMinimized(other)) {
          continue;
        }

        const otherIdx = allWindows.indexOf(other);
        // Only consider windows that are in front of BOTH source and candidate
        if (otherIdx <= sourceIdx || otherIdx <= wIdx) {
          continue;
        }

        const otherRect = other.get_frame_rect();

        // Check if this window actually blocks the gap
        const isBlocking = this.isBlockingGap(sourceRect, wRect, otherRect, direction);
        if (isBlocking) {
          return false;
        }
      }
      return true;
    });
  }

  private isBlockingGap(
    sourceRect: SimpleRect,
    targetRect: SimpleRect,
    blockerRect: SimpleRect,
    direction: ResizeDirection,
  ): boolean {
    // Check if blocker is strictly between source and target in the resize direction
    switch (direction) {
      case "east":
        // Gap is between source right and target left
        // Blocker must be: right of source AND left of target AND overlap vertically with gap
        return (
          blockerRect.x >= sourceRect.x + sourceRect.width &&
          blockerRect.x + blockerRect.width <= targetRect.x &&
          this.hasVerticalOverlap(sourceRect, blockerRect)
        );
      case "west":
        // Gap is between target right and source left
        return (
          blockerRect.x >= targetRect.x + targetRect.width &&
          blockerRect.x + blockerRect.width <= sourceRect.x &&
          this.hasVerticalOverlap(sourceRect, blockerRect)
        );
      case "south":
        // Gap is between source bottom and target top
        return (
          blockerRect.y >= sourceRect.y + sourceRect.height &&
          blockerRect.y + blockerRect.height <= targetRect.y &&
          this.hasHorizontalOverlap(sourceRect, blockerRect)
        );
      case "north":
        // Gap is between target bottom and source top
        return (
          blockerRect.y >= targetRect.y + targetRect.height &&
          blockerRect.y + blockerRect.height <= sourceRect.y &&
          this.hasHorizontalOverlap(sourceRect, blockerRect)
        );
    }
    return false;
  }

  private createGlowEffect(
    sourceWindow: Meta.Window,
    direction: ResizeDirection,
    linkedWindows: Meta.Window[],
  ) {
    this.destroyGlow();

    const sourceRect = sourceWindow.get_frame_rect();

    const linkedWindow = linkedWindows[0];
    const linkedRect = linkedWindow.get_frame_rect();

    let glowX, glowY, glowWidth, glowHeight;

    switch (direction) {
      case "east":
        // Center of gap = (source right edge + linked left edge) / 2
        const eastGapCenter = (sourceRect.x + sourceRect.width + linkedRect.x) / 2;
        glowX = Math.round(eastGapCenter - GLOW_WIDTH / 2);
        glowY = sourceRect.y;
        glowWidth = GLOW_WIDTH;
        glowHeight = sourceRect.height;
        break;
      case "west":
        // Center of gap = (linked right edge + source left edge) / 2
        const westGapCenter = (linkedRect.x + linkedRect.width + sourceRect.x) / 2;
        glowX = Math.round(westGapCenter - GLOW_WIDTH / 2);
        glowY = sourceRect.y;
        glowWidth = GLOW_WIDTH;
        glowHeight = sourceRect.height;
        break;
      case "south":
        // Center of gap = (source bottom edge + linked top edge) / 2
        const southGapCenter = (sourceRect.y + sourceRect.height + linkedRect.y) / 2;
        glowX = sourceRect.x;
        glowY = Math.round(southGapCenter - GLOW_WIDTH / 2);
        glowWidth = sourceRect.width;
        glowHeight = GLOW_WIDTH;
        break;
      case "north":
        // Center of gap = (linked bottom edge + source top edge) / 2
        const northGapCenter = (linkedRect.y + linkedRect.height + sourceRect.y) / 2;
        glowX = sourceRect.x;
        glowY = Math.round(northGapCenter - GLOW_WIDTH / 2);
        glowWidth = sourceRect.width;
        glowHeight = GLOW_WIDTH;
        break;
    }

    this.glowActor = new St.Widget({
      style_class: "linked-resize-glow",
      x: glowX,
      y: glowY,
      width: glowWidth,
      height: glowHeight,
      opacity: 0,
    });

    const color = this.getGlowColor();
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    this.glowActor.set_style(`
      background: rgba(${r}, ${g}, ${b}, ${GLOW_OPACITY});
      box-shadow: 0 0 ${GLOW_WIDTH * 2}px ${GLOW_WIDTH * 3}px ${color}, 0 0 ${GLOW_WIDTH * 4}px ${GLOW_WIDTH * 2}px ${color};
      border-radius: ${GLOW_WIDTH / 2}px;
      mix-blend-mode: screen;
    `);

    global.window_group.add_child(this.glowActor);

    this.animateGlowIn();

    if (this.resizeInfo) {
      this.resizeInfo.glow = {
        actor: this.glowActor,
        direction: direction,
      };
    }
  }

  private getGlowColor() {
    const customColor = this.settings.get_string("linked-resize-glow-color");
    if (customColor && customColor.trim() !== "") {
      return customColor.trim();
    }

    return "#3584e4";
  }

  private animateGlowIn() {
    if (!this.glowActor) return;

    this.glowActor.ease({
      opacity: Math.floor(255 * GLOW_OPACITY),
      duration: GLOW_ANIMATION_DURATION,
      mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
      onComplete: () => {
        if (!this.glowActor) return;
        this.glowActor.ease({
          opacity: Math.floor(255 * GLOW_OPACITY),
          duration: GLOW_ANIMATION_DURATION,
          mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
        });
      },
    });
  }

  private updateGlowPosition() {
    if (!this.glowActor || !this.resizeInfo) return;

    const { window, direction, linkedWindows } = this.resizeInfo;
    const rect = window.get_frame_rect();

    if (!linkedWindows || linkedWindows.length === 0) return;

    const linkedWindow = linkedWindows[0].window;
    const linkedRect = linkedWindow.get_frame_rect();

    let x, y, width, height;

    switch (direction) {
      case "east": {
        const gapCenter = (rect.x + rect.width + linkedRect.x) / 2;
        x = Math.round(gapCenter - GLOW_WIDTH / 2);
        height = Math.round(rect.height * 0.95);
        y = rect.y + Math.round((rect.height - height) / 2);
        width = GLOW_WIDTH;
        break;
      }
      case "west": {
        const gapCenter = (linkedRect.x + linkedRect.width + rect.x) / 2;
        x = Math.round(gapCenter - GLOW_WIDTH / 2);
        height = Math.round(rect.height * 0.95);
        y = rect.y + Math.round((rect.height - height) / 2);
        width = GLOW_WIDTH;
        break;
      }
      case "south": {
        const gapCenter = (rect.y + rect.height + linkedRect.y) / 2;
        width = Math.round(rect.width * 0.95);
        x = rect.x + Math.round((rect.width - width) / 2);
        y = Math.round(gapCenter - GLOW_WIDTH / 2);
        height = GLOW_WIDTH;
        break;
      }
      case "north": {
        const gapCenter = (linkedRect.y + linkedRect.height + rect.y) / 2;
        width = Math.round(rect.width * 0.95);
        x = rect.x + Math.round((rect.width - width) / 2);
        y = Math.round(gapCenter - GLOW_WIDTH / 2);
        height = GLOW_WIDTH;
        break;
      }
    }

    this.glowActor.set_position(Math.round(x), Math.round(y));
    this.glowActor.set_size(Math.round(width), Math.round(height));
  }

  private destroyGlow() {
    if (this.glowActor) {
      this.glowActor.destroy();
      this.glowActor = null;
    }
  }

  private syncLinkedWindows() {
    if (!this.isResizing || !this.resizeInfo) return;

    const { window, direction, initialRect, linkedWindows } = this.resizeInfo;
    const currentRect = window.get_frame_rect();

    const deltaW = currentRect.width - initialRect.width;
    const deltaH = currentRect.height - initialRect.height;

    for (const linked of linkedWindows) {
      const { window: linkedWindow, initialRect: linkedInitial } = linked;

      let newX = linkedInitial.x;
      let newY = linkedInitial.y;
      let newW = linkedInitial.width;
      let newH = linkedInitial.height;

      switch (direction) {
        case "east":
          newX = linkedInitial.x + deltaW;
          newW = linkedInitial.width - deltaW;
          break;
        case "west":
          newW = linkedInitial.width - deltaW;
          break;
        case "south":
          newY = linkedInitial.y + deltaH;
          newH = linkedInitial.height - deltaH;
          break;
        case "north":
          newH = linkedInitial.height - deltaH;
          break;
      }

      if (newW <= 10 || newH <= 10) continue;

      linkedWindow.move_resize_frame(
        true,
        Math.round(newX),
        Math.round(newY),
        Math.round(newW),
        Math.round(newH),
      );
    }

    this.updateGlowPosition();
  }

  private stopResize() {
    if (this.resizeTimerId) {
      GLib.Source.remove(this.resizeTimerId);
      this.resizeTimerId = 0;
    }

    this.isResizing = false;
    this.resizeInfo = null;
    this.destroyGlow();
  }
}
