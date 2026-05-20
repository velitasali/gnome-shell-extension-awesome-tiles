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
import Shell from "gi://Shell";
import Gio from "gi://Gio";
import Mtk from "gi://Mtk";
import {
  Extension,
  gettext as _,
  ngettext,
} from "resource:///org/gnome/shell/extensions/extension.js";
import { osdWindowManager, wm } from "resource:///org/gnome/shell/ui/main.js";
import { WindowMover } from "./windowMover.js";
import { LinkedResizeHandler } from "./linkedResize.js";
import {
  GAP_SIZE_MAX,
  GAP_SIZE_PIXEL_MAX,
  TILING_STEPS_CENTER,
  TILING_STEPS_SIDE,
} from "./constants.js";
import { isRectEqual, parseTilingSteps } from "./utils.js";

const DESKTOP_WM_WORKSPACE_KEYBINDINGS = [
  {
    key: "switch-to-workspace-left",
    setting: "shortcut-workspace-switch-left",
  },
  {
    key: "switch-to-workspace-right",
    setting: "shortcut-workspace-switch-right",
  },
  { key: "move-to-workspace-left", setting: "shortcut-workspace-move-left" },
  { key: "move-to-workspace-right", setting: "shortcut-workspace-move-right" },
];

const MUTTER_TILED_KEYBINDINGS = ["toggle-tiled-left", "toggle-tiled-right"];

interface TilingOperation {
  windowId: number;
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  rect: { x: number; y: number; width: number; height: number };
  time: number;
  iteration: number;
  window: Meta.Window;
}

export default class AwesomeTilesExtension extends Extension {
  private thisExtension: ThisExtension | null = null;

  enable() {
    const settings = this.getSettings();
    this.thisExtension = ThisExtension.enable(settings);
  }

  disable() {
    this.thisExtension?.disable();
    this.thisExtension = null;
  }
}

/**
 * Instead of having nullable properties inside AwesomeTilesExtension class, I
 * have decided to have another class. This way we don't have to assign null to
 * properties either.
 */
class ThisExtension {
  private windowMover = new WindowMover();
  private osdGapChangedIcon = Gio.icon_new_for_string("view-grid-symbolic");
  private shortcutsBindingIds: string[] = [];
  private linkedResizeHandler: LinkedResizeHandler;
  private workspaceSettingsConnections: Array<{
    setting: string;
    connection: number;
  }> = [];
  private previousTilingOperation?: TilingOperation;

  constructor(private readonly settings: Gio.Settings) {
    this.linkedResizeHandler = new LinkedResizeHandler(this.settings);
  }

  /**
   * Don't enable inside the constructor, I guess.
   * @param settings
   * @returns The newly instantiated instance of the class.
   */
  static enable(settings: Gio.Settings) {
    const extension = new ThisExtension(settings);

    extension.enableInternal();

    return extension;
  }

  private enableInternal() {
    this.linkedResizeHandler.enable();

    this.applyWorkspaceKeybindingsOverride();

    this.settings.connect("changed::override-system-keybindings", () => {
      if (this.settings.get_boolean("override-system-keybindings")) {
        this.applyWorkspaceKeybindingsOverride();
      } else {
        this.resetWorkspaceKeybindings();
      }
    });

    this.bindShortcut("shortcut-align-window-to-center", this.alignWindowToCenter.bind(this));
    this.bindShortcut("shortcut-tile-window-to-center", this.tileWindowCenter.bind(this));
    this.bindShortcut("shortcut-tile-window-to-left", this.tileWindowLeft.bind(this));
    this.bindShortcut("shortcut-tile-window-to-right", this.tileWindowRight.bind(this));
    this.bindShortcut("shortcut-tile-window-to-top", this.tileWindowTop.bind(this));
    this.bindShortcut("shortcut-tile-window-to-top-left", this.tileWindowTopLeft.bind(this));
    this.bindShortcut("shortcut-tile-window-to-top-right", this.tileWindowTopRight.bind(this));
    this.bindShortcut("shortcut-tile-window-to-bottom", this.tileWindowBottom.bind(this));
    this.bindShortcut("shortcut-tile-window-to-bottom-left", this.tileWindowBottomLeft.bind(this));
    this.bindShortcut(
      "shortcut-tile-window-to-bottom-right",
      this.tileWindowBottomRight.bind(this),
    );
    this.bindShortcut("shortcut-increase-gap-size", this.increaseGapSize.bind(this));
    this.bindShortcut("shortcut-decrease-gap-size", this.decreaseGapSize.bind(this));

    this.linkedResizeHandler.enable();

    this.workspaceSettingsConnections = [];
    DESKTOP_WM_WORKSPACE_KEYBINDINGS.forEach((binding) => {
      const connection = this.settings.connect(`changed::${binding.setting}`, () => {
        this.syncWorkspaceKeybindings();
      });
      this.workspaceSettingsConnections.push({
        setting: binding.setting,
        connection,
      });
    });
  }

  disable() {
    this.windowMover.destroy();
    this.shortcutsBindingIds.forEach((id) => wm.removeKeybinding(id));

    this.linkedResizeHandler.disable();

    if (this.workspaceSettingsConnections) {
      this.workspaceSettingsConnections.forEach(({ connection }) => {
        this.settings.disconnect(connection);
      });
    }

    if (this.settings.get_boolean("override-system-keybindings")) {
      this.resetWorkspaceKeybindings();
    }

    this.shortcutsBindingIds = [];
    this.workspaceSettingsConnections = [];
  }

  private syncWorkspaceKeybindings() {
    if (this.settings.get_boolean("override-system-keybindings")) {
      this.applyWorkspaceKeybindingsOverride();
    }
  }

  private applyWorkspaceKeybindingsOverride() {
    if (!this.settings.get_boolean("override-system-keybindings")) return;

    try {
      const gnomeDesktopWmKeybindingsSettings = new Gio.Settings({
        schema_id: "org.gnome.desktop.wm.keybindings",
      });
      const gnomeMutterKeybindingSettings = new Gio.Settings({
        schema_id: "org.gnome.mutter.keybindings",
      });

      DESKTOP_WM_WORKSPACE_KEYBINDINGS.forEach((binding) => {
        const shortcut = this.settings.get_strv(binding.setting);
        gnomeDesktopWmKeybindingsSettings.set_strv(binding.key, shortcut);
      });

      MUTTER_TILED_KEYBINDINGS.forEach((key) => gnomeMutterKeybindingSettings.set_strv(key, []));
    } catch (e) {
      console.error(e);
    }
  }

  private resetWorkspaceKeybindings() {
    try {
      const gnomeDesktopWmKeybindingsSettings = new Gio.Settings({
        schema_id: "org.gnome.desktop.wm.keybindings",
      });
      const gnomeMutterKeybindingSettings = new Gio.Settings({
        schema_id: "org.gnome.mutter.keybindings",
      });
      DESKTOP_WM_WORKSPACE_KEYBINDINGS.forEach((binding) =>
        gnomeDesktopWmKeybindingsSettings.reset(binding.key),
      );
      MUTTER_TILED_KEYBINDINGS.forEach((key) => gnomeMutterKeybindingSettings.reset(key));
    } catch (e) {
      console.error(e);
    }
  }

  alignWindowToCenter() {
    const window = global.display.get_focus_window();
    if (!window) return;

    const windowArea = window.get_frame_rect();
    const monitor = window.get_monitor();
    const workspace = window.get_workspace();
    const workspaceArea = workspace.get_work_area_for_monitor(monitor);

    const x = Math.floor(workspaceArea.x + (workspaceArea.width - windowArea.width) / 2);
    const y = Math.floor(workspaceArea.y + (workspaceArea.height - windowArea.height) / 2);

    this.windowMover.setWindowRect(
      window,
      x,
      y,
      windowArea.width,
      windowArea.height,
      this.isWindowAnimationEnabled,
    );
  }

  private bindShortcut(name: string, callback: () => void) {
    wm.addKeybinding(
      name,
      this.settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      callback,
    );

    this.shortcutsBindingIds.push(name);
  }

  private calculateWorkspaceArea(window: Meta.Window) {
    const monitor = window.get_monitor();
    const monitorGeometry = global.display.get_monitor_geometry(monitor);
    const isVertical = monitorGeometry.width < monitorGeometry.height;

    const workspace = window.get_workspace();
    const workspaceArea = workspace.get_work_area_for_monitor(monitor);

    if (this.isIndividualGapSizesEnabled) {
      return this.calculateIndividualWorkspaceArea(workspaceArea, monitor, isVertical);
    }

    const gap = this.gapSize;

    if (gap <= 0 && !this.isBottomGapEnabled)
      return {
        x: workspaceArea.x,
        y: workspaceArea.y,
        height: workspaceArea.height,
        width: workspaceArea.width,
      };

    let gaps;
    if (this.isGapSizeInPixels) {
      const gapPx = Math.round(gap);
      gaps = {
        x: Math.min(gapPx, Math.floor(workspaceArea.width / 2)),
        y: Math.min(gapPx, Math.floor(workspaceArea.height / 2)),
      };
    } else {
      const gapUncheckedX = Math.round((gap / 200) * workspaceArea.width);
      const gapUncheckedY = Math.round((gap / 200) * workspaceArea.height);

      gaps = {
        x: Math.min(gapUncheckedX, gapUncheckedY * 2),
        y: Math.min(gapUncheckedY, gapUncheckedX * 2),
      };
    }

    if (isVertical) {
      const temp = gaps.x;
      gaps.x = gaps.y;
      gaps.y = temp;
    }

    let bottomGap = 0;
    if (this.isBottomGapEnabled) {
      const isPrimaryMonitor = monitor === global.display.get_primary_monitor();
      if (!this.isBottomGapMainScreenOnly || isPrimaryMonitor) {
        if (this.isGapSizeInPixels) {
          bottomGap = Math.round(this.bottomGapSize);
        } else {
          bottomGap = Math.round((this.bottomGapSize / 100) * workspaceArea.height);
        }
      }
    }

    return {
      x: workspaceArea.x + gaps.x,
      y: workspaceArea.y + gaps.y,
      height: workspaceArea.height - gaps.y * 2 - bottomGap,
      width: workspaceArea.width - gaps.x * 2,
      gaps,
      bottomGap,
    };
  }

  private calculateIndividualWorkspaceArea(
    workspaceArea: Mtk.Rectangle,
    monitor: number,
    isVertical: boolean,
  ) {
    const gapTop = this.gapSizeTop;
    const gapBottom = this.gapSizeBottom;
    const gapLeft = this.gapSizeLeft;
    const gapRight = this.gapSizeRight;

    const gaps = { x: 0, y: 0 };

    if (this.isGapSizeInPixels) {
      gaps.x = Math.min(gapLeft + gapRight, workspaceArea.width);
      gaps.y = Math.min(gapTop + gapBottom, workspaceArea.height);
    } else {
      const gapTopPx = Math.round((gapTop / 200) * workspaceArea.height);
      const gapBottomPx = Math.round((gapBottom / 200) * workspaceArea.height);
      const gapLeftPx = Math.round((gapLeft / 200) * workspaceArea.width);
      const gapRightPx = Math.round((gapRight / 200) * workspaceArea.width);

      gaps.x = Math.min(gapLeftPx + gapRightPx, (gapTopPx + gapBottomPx) * 2);
      gaps.y = Math.min(gapTopPx + gapBottomPx, (gapLeftPx + gapRightPx) * 2);
    }

    if (isVertical) {
      const tempX = gaps.x;
      gaps.x = gaps.y;
      gaps.y = tempX;
    }

    let extraBottomGap = 0;
    if (this.isBottomGapEnabled) {
      const isPrimaryMonitor = monitor === global.display.get_primary_monitor();
      if (!this.isBottomGapMainScreenOnly || isPrimaryMonitor) {
        if (this.isGapSizeInPixels) {
          extraBottomGap = Math.round(this.bottomGapSize);
        } else {
          extraBottomGap = Math.round((this.bottomGapSize / 100) * workspaceArea.height);
        }
      }
    }

    let topGap, leftGap, rightGap, bottomGap;
    if (this.isGapSizeInPixels) {
      topGap = gapTop;
      leftGap = gapLeft;
      rightGap = gapRight;
      bottomGap = gapBottom + extraBottomGap;
    } else {
      topGap = Math.round((gapTop / 200) * workspaceArea.height);
      leftGap = Math.round((gapLeft / 200) * workspaceArea.width);
      rightGap = Math.round((gapRight / 200) * workspaceArea.width);
      bottomGap = Math.round((gapBottom / 200) * workspaceArea.height) + extraBottomGap;
    }

    if (isVertical) {
      const tempTop = topGap;
      topGap = leftGap;
      leftGap = tempTop;
      const tempBottom = bottomGap;
      bottomGap = rightGap;
      rightGap = tempBottom;
    }

    return {
      x: workspaceArea.x + leftGap,
      y: workspaceArea.y + topGap,
      height: workspaceArea.height - topGap - bottomGap,
      width: workspaceArea.width - leftGap - rightGap,
      gaps,
      bottomGap: extraBottomGap,
      individualGaps: {
        top: topGap,
        left: leftGap,
        right: rightGap,
        bottom: bottomGap,
      },
    };
  }

  private get gapSizeIncrements() {
    return this.settings.get_int("gap-size-increments");
  }

  private decreaseGapSize() {
    this.gapSize = Math.max(this.gapSize - this.gapSizeIncrements, 0);
    this.notifyGapSize();
  }

  private increaseGapSize() {
    const maxGap = this.isGapSizeInPixels ? GAP_SIZE_PIXEL_MAX : GAP_SIZE_MAX;
    this.gapSize = Math.min(this.gapSize + this.gapSizeIncrements, maxGap);
    this.notifyGapSize();
  }

  private get isGapSizeInPixels() {
    return this.settings.get_boolean("gap-size-in-pixels");
  }

  private get gapSize() {
    return this.settings.get_int("gap-size");
  }

  private set gapSize(intValue) {
    this.settings.set_int("gap-size", intValue);
  }

  private notifyGapSize() {
    const gapSize = this.gapSize;
    const label = this.isGapSizeInPixels
      ? ngettext("Gap size is now at %d pixel", "Gap size is now at %d pixels", gapSize).format(
          gapSize,
        )
      : ngettext("Gap size is now at %d percent", "Gap size is now at %d percent", gapSize).format(
          gapSize,
        );

    if (osdWindowManager && osdWindowManager.showOne) {
      osdWindowManager.showOne(
        global.display.get_current_monitor(),
        this.osdGapChangedIcon,
        label,
        null,
        -1,
      );
    }
  }

  private get isIndividualGapSizesEnabled() {
    return this.settings.get_boolean("enable-individual-gap-sizes");
  }

  private get gapSizeTop() {
    return this.settings.get_int("gap-size-top");
  }

  private get gapSizeLeft() {
    return this.settings.get_int("gap-size-left");
  }

  private get gapSizeRight() {
    return this.settings.get_int("gap-size-right");
  }

  private get gapSizeBottom() {
    return this.settings.get_int("gap-size-bottom");
  }

  private get gapSizeInner() {
    return this.settings.get_int("gap-size-inner");
  }

  private get isInnerGapsEnabled() {
    return this.settings.get_boolean("enable-inner-gaps");
  }

  private get isBottomGapEnabled() {
    return this.settings.get_boolean("enable-bottom-gap");
  }

  private get isBottomGapMainScreenOnly() {
    return this.settings.get_boolean("bottom-gap-main-screen-only");
  }

  private get bottomGapSize() {
    return this.settings.get_int("bottom-gap-size");
  }

  private get tilingStepsCenter() {
    return parseTilingSteps(this.settings.get_string("tiling-steps-center"), TILING_STEPS_CENTER);
  }

  private get tilingStepsSide() {
    return parseTilingSteps(this.settings.get_string("tiling-steps-side"), TILING_STEPS_SIDE);
  }

  private get isWindowAnimationEnabled() {
    return this.settings.get_boolean("enable-window-animation");
  }

  private get nextStepTimeout() {
    return this.settings.get_int("next-step-timeout");
  }

  private tileWindow(top: boolean, bottom: boolean, left: boolean, right: boolean) {
    const window = global.display.get_focus_window();
    if (!window) return;

    const { x, y, width, height } = this.nextWindowRect(window, top, bottom, left, right);

    this.windowMover.setWindowRect(window, x, y, width, height, this.isWindowAnimationEnabled);
  }

  private nextWindowRect(
    window: Meta.Window,
    top: boolean,
    bottom: boolean,
    left: boolean,
    right: boolean,
  ) {
    const time = Date.now();
    const center = !(top || bottom || left || right);
    const prev = this.previousTilingOperation;
    const windowId = window.get_id();
    const steps = center ? this.tilingStepsCenter : this.tilingStepsSide;
    const successive =
      prev &&
      prev.windowId === windowId &&
      time - prev.time <= this.nextStepTimeout &&
      prev.top === top &&
      prev.bottom === bottom &&
      prev.left === left &&
      prev.right === right &&
      prev.iteration < steps.length &&
      prev.window === window;
    let iteration = successive ? prev.iteration : 0;
    let rect = this.computeWindowRect(window, top, bottom, left, right, steps[iteration], center);

    for (const end = iteration; successive && isRectEqual(rect, prev.rect); ) {
      iteration = (iteration + 1) % steps.length;
      if (iteration === end) break;
      rect = this.computeWindowRect(window, top, bottom, left, right, steps[iteration], center);
    }

    this.previousTilingOperation = {
      windowId,
      top,
      bottom,
      left,
      right,
      rect,
      time,
      iteration: iteration + 1,
      window,
    };

    return rect;
  }

  private computeWindowRect(
    window: Meta.Window,
    top: boolean,
    bottom: boolean,
    left: boolean,
    right: boolean,
    step: number[],
    center: boolean,
  ) {
    const widthFactor = 1.0 - step[0];
    const heightFactor = step.length > 1 ? 1.0 - step[1] : widthFactor;

    const workArea = this.calculateWorkspaceArea(window);
    let { x, y, width, height } = workArea;

    if (center) {
      const monitor = window.get_monitor();
      const monitorGeometry = global.display.get_monitor_geometry(monitor);
      const isVertical = monitorGeometry.width < monitorGeometry.height;
      const centerTilingWidthFactor = isVertical ? widthFactor / 2 : widthFactor;
      const centerTilingHeightFactor = isVertical ? heightFactor : heightFactor / 2;

      width -= width * centerTilingWidthFactor;
      height -= height * centerTilingHeightFactor;
      x += (workArea.width - width) / 2;
      y += (workArea.height - height) / 2;
    } else {
      if (left !== right) width -= width * widthFactor;
      if (top !== bottom) height -= height * heightFactor;
      if (!left) x += (workArea.width - width) / (right ? 1 : 2);
      if (!top) y += (workArea.height - height) / (bottom ? 1 : 2);

      if (this.isInnerGapsEnabled) {
        let innerGapX, innerGapY;
        if (this.isIndividualGapSizesEnabled) {
          const innerGap = this.gapSizeInner;
          if (this.isGapSizeInPixels) {
            innerGapX = innerGap;
            innerGapY = innerGap;
          } else {
            innerGapX = Math.round((innerGap / 200) * workArea.width);
            innerGapY = Math.round((innerGap / 200) * workArea.height);
          }
        } else {
          innerGapX = workArea.gaps?.x ?? 0;
          innerGapY = workArea.gaps?.y ?? 0;
        }
        if (left !== right) {
          if (right) x += innerGapX / 2;
          width -= innerGapX / 2;
        }
        if (top !== bottom) {
          if (bottom) y += innerGapY / 2;
          height -= innerGapY / 2;
        }
      }
    }

    x = Math.round(x);
    y = Math.round(y);
    width = Math.round(width);
    height = Math.round(height);

    return { x, y, width, height };
  }

  private tileWindowBottom() {
    this.tileWindow(false, true, true, true);
  }

  private tileWindowBottomLeft() {
    this.tileWindow(false, true, true, false);
  }

  private tileWindowBottomRight() {
    this.tileWindow(false, true, false, true);
  }

  private tileWindowCenter() {
    this.tileWindow(false, false, false, false);
  }

  private tileWindowLeft() {
    this.tileWindow(true, true, true, false);
  }

  private tileWindowRight() {
    this.tileWindow(true, true, false, true);
  }

  private tileWindowTop() {
    this.tileWindow(true, false, true, true);
  }

  private tileWindowTopLeft() {
    this.tileWindow(true, false, true, false);
  }

  private tileWindowTopRight() {
    this.tileWindow(true, false, false, true);
  }
}
