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

import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import * as Utils from "./prefs-utils.js";
import {
  GAP_SIZE_MAX,
  GAP_SIZE_PIXEL_MAX,
  GAP_SIZE_PIXEL_INCREMENTS,
  BOTTOM_GAP_SIZE_PIXEL_MAX,
  INDIVIDUAL_GAP_SIZE_MAX,
  INDIVIDUAL_GAP_SIZE_PIXEL_MAX,
} from "./constants.js";

export default class AwesomeTilesPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow) {
    const settings = this.getSettings();
    const builder = new PreferencesWindowBuilder(window, settings, this.path);

    builder.build();
  }
}

class PreferencesWindowBuilder {
  constructor(
    private readonly window: Adw.PreferencesWindow,
    private readonly settings: Gio.Settings,
    private readonly path: string,
  ) {}

  build() {
    const { window } = this;

    // Behavior Page
    const behaviorPage = new Adw.PreferencesPage({
      title: _("Behavior"),
      icon_name: "system-run-symbolic",
    });
    const behaviorGroup = this.createBehaviorGroup();
    behaviorPage.add(behaviorGroup);
    window.add(behaviorPage);

    // Gaps Page
    const gapsPage = new Adw.PreferencesPage({
      title: _("Gaps"),
      icon_name: "view-grid-symbolic",
    });
    const gapsGroup = this.createGapsGroup();
    gapsPage.add(gapsGroup);
    window.add(gapsPage);

    // Shortcuts Page
    const shortcutsPage = new Adw.PreferencesPage({
      title: _("Shortcuts"),
      icon_name: "preferences-desktop-keyboard-shortcuts-symbolic",
    });
    const shortcutsGroup = this.createShortcutsGroup();
    shortcutsPage.add(shortcutsGroup);
    window.add(shortcutsPage);

    // About Page
    const aboutPage = this.createAboutPage();
    window.add(aboutPage);
  }

  private createBehaviorGroup() {
    const { settings } = this;

    const behaviorGroup = new Adw.PreferencesGroup({
      title: _("Behavior"),
    });

    const enableAnimationsSwitchRow = new Adw.SwitchRow({
      title: _("Enable Window Animations"),
      subtitle: _("Animate windows when resized or repositioned (this may be buggy on Wayland)."),
    });
    behaviorGroup.add(enableAnimationsSwitchRow);
    settings.bind(
      "enable-window-animation",
      enableAnimationsSwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const nextIterationTimeoutSpinRow = new Adw.SpinRow({
      title: _("Shortcut Iteration Timeout in Milliseconds"),
      subtitle: _("The time window to consider a new key press an iteration."),
      adjustment: new Gtk.Adjustment({
        lower: 100,
        upper: 10000,
        step_increment: 100,
      }),
    });
    behaviorGroup.add(nextIterationTimeoutSpinRow);
    settings.bind(
      "next-step-timeout",
      nextIterationTimeoutSpinRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const centerTilingStepsEntry = new Gtk.Entry({
      valign: Gtk.Align.CENTER,
    });
    const centerTilingStepsActionRow = new Adw.ActionRow({
      title: _("Center Tiling Steps"),
      subtitle: _("Steps on each key press (values between 0-1)."),
    });
    centerTilingStepsActionRow.add_suffix(centerTilingStepsEntry);
    behaviorGroup.add(centerTilingStepsActionRow);
    settings.bind(
      "tiling-steps-center",
      centerTilingStepsEntry.buffer,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const sideTilingStepsEntry = new Gtk.Entry({
      valign: Gtk.Align.CENTER,
    });
    const sideTilingStepsActionRow = new Adw.ActionRow({
      title: _("Side Tiling Steps"),
      subtitle: _("Steps on each key press (values between 0-1)."),
    });
    sideTilingStepsActionRow.add_suffix(sideTilingStepsEntry);
    behaviorGroup.add(sideTilingStepsActionRow);
    settings.bind(
      "tiling-steps-side",
      sideTilingStepsEntry.buffer,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const enableLinkedResizeSwitchRow = new Adw.SwitchRow({
      title: _("Enable Linked Window Resize"),
      subtitle: _(
        "When holding Alt and resizing a window, adjacent tiled windows will resize together to maintain the gap.",
      ),
    });
    behaviorGroup.add(enableLinkedResizeSwitchRow);
    settings.bind(
      "enable-linked-resize",
      enableLinkedResizeSwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const linkedResizeGlowColorEntry = new Gtk.Entry({
      valign: Gtk.Align.CENTER,
      placeholder_text: _("Use theme accent color"),
      width_chars: 12,
    });
    const linkedResizeGlowColorActionRow = new Adw.ActionRow({
      title: _("Linked Resize Glow Color"),
      subtitle: _(
        "Custom color for the glow effect during linked resize (hex format like #3584e4). Leave empty to use theme accent color.",
      ),
    });
    linkedResizeGlowColorActionRow.add_suffix(linkedResizeGlowColorEntry);
    behaviorGroup.add(linkedResizeGlowColorActionRow);
    settings.bind(
      "linked-resize-glow-color",
      linkedResizeGlowColorEntry.buffer,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const updateLinkedResizeGlowRow = () => {
      const enabled = settings.get_boolean("enable-linked-resize");
      linkedResizeGlowColorActionRow.visible = enabled;
    };
    settings.connect("changed::enable-linked-resize", updateLinkedResizeGlowRow);
    updateLinkedResizeGlowRow();

    updateLinkedResizeGlowRow();

    return behaviorGroup;
  }

  private createGapsGroup() {
    const { settings } = this;
    const gapsGroup = new Adw.PreferencesGroup({
      title: _("Gaps"),
    });

    const gapSizeInPixelsSwitchRow = new Adw.SwitchRow({
      title: _("Use Pixels for Gap Size"),
      subtitle: _("Use pixels instead of percentage for gap size."),
    });
    gapsGroup.add(gapSizeInPixelsSwitchRow);
    settings.bind(
      "gap-size-in-pixels",
      gapSizeInPixelsSwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const gapsBetweenWindowsSwitchRow = new Adw.SwitchRow({
      title: _("Gaps Between Windows"),
      subtitle: _("Put gaps between windows."),
    });
    gapsGroup.add(gapsBetweenWindowsSwitchRow);
    settings.bind(
      "enable-inner-gaps",
      gapsBetweenWindowsSwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const individualGapSizesSwitchRow = new Adw.SwitchRow({
      title: _("Enable Individual Gap Sizes"),
      subtitle: _(
        "Configure separate gap sizes for each side (top, left, bottom, right) and between windows.",
      ),
    });
    gapsGroup.add(individualGapSizesSwitchRow);
    settings.bind(
      "enable-individual-gap-sizes",
      individualGapSizesSwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const gapSizeTopSpinRow = new Adw.SpinRow({
      title: _("Top Gap Size"),
      subtitle: _("Gap size at the top (percent)."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeTopSpinRow);
    settings.bind("gap-size-top", gapSizeTopSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const gapSizeLeftSpinRow = new Adw.SpinRow({
      title: _("Left Gap Size"),
      subtitle: _("Gap size at the left (percent)."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeLeftSpinRow);
    settings.bind("gap-size-left", gapSizeLeftSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const gapSizeRightSpinRow = new Adw.SpinRow({
      title: _("Right Gap Size"),
      subtitle: _("Gap size at the right (percent)."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeRightSpinRow);
    settings.bind("gap-size-right", gapSizeRightSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const gapSizeBottomSpinRow = new Adw.SpinRow({
      title: _("Bottom Gap Size"),
      subtitle: _("Gap size at the bottom (percent)."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeBottomSpinRow);
    settings.bind("gap-size-bottom", gapSizeBottomSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const gapSizeInnerSpinRow = new Adw.SpinRow({
      title: _("Inner Gap Size"),
      subtitle: _("Gap size between windows (percent)."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeInnerSpinRow);
    settings.bind("gap-size-inner", gapSizeInnerSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const individualGapRows = [
      gapSizeTopSpinRow,
      gapSizeLeftSpinRow,
      gapSizeRightSpinRow,
      gapSizeBottomSpinRow,
      gapSizeInnerSpinRow,
    ];

    const updateIndividualGapRows = () => {
      const useIndividual = settings.get_boolean("enable-individual-gap-sizes");
      const usePixels = settings.get_boolean("gap-size-in-pixels");

      individualGapRows.forEach((row) => {
        row.visible = useIndividual;
      });

      const maxValue = usePixels ? INDIVIDUAL_GAP_SIZE_PIXEL_MAX : INDIVIDUAL_GAP_SIZE_MAX;
      const stepIncrement = usePixels ? GAP_SIZE_PIXEL_INCREMENTS : 1;

      const unit = usePixels ? _("pixels") : _("percent");
      gapSizeTopSpinRow.subtitle = `${_("Gap size at the top")} (${unit})`;
      gapSizeLeftSpinRow.subtitle = `${_("Gap size at the left")} (${unit})`;
      gapSizeRightSpinRow.subtitle = `${_("Gap size at the right")} (${unit})`;
      gapSizeBottomSpinRow.subtitle = `${_("Gap size at the bottom")} (${unit})`;
      gapSizeInnerSpinRow.subtitle = `${_("Gap size between windows")} (${unit})`;

      individualGapRows.forEach((row) => {
        row.adjustment.upper = maxValue;
        row.adjustment.step_increment = stepIncrement;
      });
    };

    settings.connect("changed::enable-individual-gap-sizes", updateIndividualGapRows);
    settings.connect("changed::gap-size-in-pixels", updateIndividualGapRows);
    updateIndividualGapRows();

    const gapSizeSpinRow = new Adw.SpinRow({
      title: _("Gap Between Window and Workspace"),
      subtitle: _("Percentage to leave out as gap when a window is tiled."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 25,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeSpinRow);
    settings.bind("gap-size", gapSizeSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const updateGapSizeRow = () => {
      const usePixels = settings.get_boolean("gap-size-in-pixels");
      const useIndividual = settings.get_boolean("enable-individual-gap-sizes");
      gapSizeSpinRow.subtitle = usePixels
        ? _("Pixels to leave out as gap when a window is tiled.")
        : _("Percentage to leave out as gap when a window is tiled.");
      gapSizeSpinRow.adjustment.upper = usePixels ? GAP_SIZE_PIXEL_MAX : GAP_SIZE_MAX;
      gapSizeSpinRow.adjustment.step_increment = usePixels ? GAP_SIZE_PIXEL_INCREMENTS : 1;
      gapSizeSpinRow.visible = !useIndividual;
    };
    settings.connect("changed::gap-size-in-pixels", updateGapSizeRow);
    settings.connect("changed::enable-individual-gap-sizes", updateGapSizeRow);
    updateGapSizeRow();

    const gapSizeIncrementsSpinRow = new Adw.SpinRow({
      title: _("Gap Size Increments"),
      subtitle: _("The change that the shorcuts make in the gap size."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 25,
        step_increment: 1,
      }),
    });
    gapsGroup.add(gapSizeIncrementsSpinRow);
    settings.bind(
      "gap-size-increments",
      gapSizeIncrementsSpinRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const updateIncrementsRow = () => {
      const usePixels = settings.get_boolean("gap-size-in-pixels");
      gapSizeIncrementsSpinRow.adjustment.upper = usePixels ? GAP_SIZE_PIXEL_MAX : GAP_SIZE_MAX;
      gapSizeIncrementsSpinRow.adjustment.step_increment = usePixels
        ? GAP_SIZE_PIXEL_INCREMENTS
        : 1;
    };
    settings.connect("changed::gap-size-in-pixels", updateIncrementsRow);
    updateIncrementsRow();

    const bottomGapSwitchRow = new Adw.SwitchRow({
      title: _("Enable Additional Bottom Gap"),
      subtitle: _("Add an additional gap at the bottom of the screen to prevent dock overlap."),
    });
    gapsGroup.add(bottomGapSwitchRow);
    settings.bind("enable-bottom-gap", bottomGapSwitchRow, "active", Gio.SettingsBindFlags.DEFAULT);

    const bottomGapSizeSpinRow = new Adw.SpinRow({
      title: _("Bottom Gap Size"),
      subtitle: _("Additional gap size at the bottom of the screen in percentage."),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
      }),
    });
    gapsGroup.add(bottomGapSizeSpinRow);
    settings.bind("bottom-gap-size", bottomGapSizeSpinRow, "value", Gio.SettingsBindFlags.DEFAULT);

    const updateBottomGapSizeRow = () => {
      const usePixels = settings.get_boolean("gap-size-in-pixels");
      bottomGapSizeSpinRow.subtitle = usePixels
        ? _("Additional gap size at the bottom of the screen in pixels.")
        : _("Additional gap size at the bottom of the screen in percentage.");
      bottomGapSizeSpinRow.adjustment.upper = usePixels ? BOTTOM_GAP_SIZE_PIXEL_MAX : 50;
      bottomGapSizeSpinRow.adjustment.step_increment = usePixels ? GAP_SIZE_PIXEL_INCREMENTS : 5;
    };
    settings.connect("changed::gap-size-in-pixels", updateBottomGapSizeRow);
    updateBottomGapSizeRow();

    const bottomGapMainScreenOnlySwitchRow = new Adw.SwitchRow({
      title: _("Bottom Gap Main Screen Only"),
      subtitle: _("Apply the additional bottom gap only on the main screen."),
    });
    gapsGroup.add(bottomGapMainScreenOnlySwitchRow);
    settings.bind(
      "bottom-gap-main-screen-only",
      bottomGapMainScreenOnlySwitchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const updateBottomGapVisibility = () => {
      const enabled = settings.get_boolean("enable-bottom-gap");
      bottomGapSizeSpinRow.visible = enabled;
      bottomGapMainScreenOnlySwitchRow.visible = enabled;
    };
    settings.connect("changed::enable-bottom-gap", updateBottomGapVisibility);
    updateBottomGapVisibility();

    return gapsGroup;
  }

  private createShortcutsGroup() {
    const { settings } = this;

    const shortcutsGroup = new Adw.PreferencesGroup({
      title: _("Shortcuts"),
      description: _("Assign shortcuts to the functionalities"),
    });

    const numpadFixButton = new Gtk.Button({
      icon_name: "dialog-warning-symbolic",
      label: _("Fix Numpad 9 and Numpad 3"),
      valign: Gtk.Align.CENTER,
    });
    const numpadFixActionRow = new Adw.ActionRow({
      title: _("Numpad Tiling Fix"),
      subtitle: _(
        "Resolve workspace switching shortcut conflicts on certain keyboards by overriding system defaults to match extension settings.",
      ),
      activatable_widget: numpadFixButton,
    });
    numpadFixActionRow.add_suffix(numpadFixButton);
    shortcutsGroup.add(numpadFixActionRow);
    const linkedResizeShortcutButton = new Gtk.Button({
      name: "shortcut-linked-resize",
      valign: Gtk.Align.CENTER,
    });
    const linkedResizeShortcutActionRow = new Adw.ActionRow({
      title: _("Linked Resize Modifier"),
      subtitle: _("The modifier key held while resizing to trigger linked resizing."),
    });
    linkedResizeShortcutActionRow.add_suffix(linkedResizeShortcutButton);
    shortcutsGroup.add(linkedResizeShortcutActionRow);

    numpadFixButton.connect("clicked", this.onShowNumpadFixDialog.bind(this));

    const workspaceSwitchLeftButton = new Gtk.Button({
      name: "shortcut-workspace-switch-left",
      valign: Gtk.Align.CENTER,
    });
    const workspaceSwitchLeftActionRow = new Adw.ActionRow({
      title: _("Switch to Workspace Left"),
      subtitle: _("Shortcut to switch to the workspace on the left."),
    });
    workspaceSwitchLeftActionRow.add_suffix(workspaceSwitchLeftButton);
    shortcutsGroup.add(workspaceSwitchLeftActionRow);

    const workspaceSwitchRightButton = new Gtk.Button({
      name: "shortcut-workspace-switch-right",
      valign: Gtk.Align.CENTER,
    });
    const workspaceSwitchRightActionRow = new Adw.ActionRow({
      title: _("Switch to Workspace Right"),
      subtitle: _("Shortcut to switch to the workspace on the right."),
    });
    workspaceSwitchRightActionRow.add_suffix(workspaceSwitchRightButton);
    shortcutsGroup.add(workspaceSwitchRightActionRow);

    const workspaceMoveLeftButton = new Gtk.Button({
      name: "shortcut-workspace-move-left",
      valign: Gtk.Align.CENTER,
    });
    const workspaceMoveLeftActionRow = new Adw.ActionRow({
      title: _("Move Window to Workspace Left"),
      subtitle: _("Shortcut to move the focused window to the workspace on the left."),
    });
    workspaceMoveLeftActionRow.add_suffix(workspaceMoveLeftButton);
    shortcutsGroup.add(workspaceMoveLeftActionRow);

    const workspaceMoveRightButton = new Gtk.Button({
      name: "shortcut-workspace-move-right",
      valign: Gtk.Align.CENTER,
    });
    const workspaceMoveRightActionRow = new Adw.ActionRow({
      title: _("Move Window to Workspace Right"),
      subtitle: _("Shortcut to move the focused window to the workspace on the right."),
    });
    workspaceMoveRightActionRow.add_suffix(workspaceMoveRightButton);
    shortcutsGroup.add(workspaceMoveRightActionRow);

    const workspaceRows = [
      workspaceSwitchLeftActionRow,
      workspaceSwitchRightActionRow,
      workspaceMoveLeftActionRow,
      workspaceMoveRightActionRow,
    ];

    const updateWorkspaceRowsVisibility = () => {
      const enabled = settings.get_boolean("override-system-keybindings");
      workspaceRows.forEach((row) => {
        row.visible = enabled;
      });
    };
    settings.connect("changed::override-system-keybindings", updateWorkspaceRowsVisibility);
    updateWorkspaceRowsVisibility();

    const alignWindowToCenterButton = new Gtk.Button({
      name: "shortcut-align-window-to-center",
      valign: Gtk.Align.CENTER,
    });
    const alignWindowToCenterActionRow = new Adw.ActionRow({
      title: _("Align Window to Center"),
      subtitle: _("Shortcut to align the active window to center without resizing it."),
    });
    alignWindowToCenterActionRow.add_suffix(alignWindowToCenterButton);
    shortcutsGroup.add(alignWindowToCenterActionRow);

    const incrementGapSizeButton = new Gtk.Button({
      name: "shortcut-increase-gap-size",
      valign: Gtk.Align.CENTER,
    });
    const incrementGapSizeActionRow = new Adw.ActionRow({
      title: _("Increase Gap Size"),
      subtitle: _("Shortcut to increase the gap size."),
    });
    incrementGapSizeActionRow.add_suffix(incrementGapSizeButton);
    shortcutsGroup.add(incrementGapSizeActionRow);

    const decreaseGapSizeButton = new Gtk.Button({
      name: "shortcut-decrease-gap-size",
      valign: Gtk.Align.CENTER,
    });
    const decreaseGapSizeActionRow = new Adw.ActionRow({
      title: _("Decrease Gap Size"),
      subtitle: _("Shortcut to decrease the gap size."),
    });
    decreaseGapSizeActionRow.add_suffix(decreaseGapSizeButton);
    shortcutsGroup.add(decreaseGapSizeActionRow);

    const tileWindowToCenterButton = new Gtk.Button({
      name: "shortcut-tile-window-to-center",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToCenterActionRow = new Adw.ActionRow({
      title: _("Tile Window to Center"),
      subtitle: _("Shortcut to tile active window to center."),
    });
    tileWindowToCenterActionRow.add_suffix(tileWindowToCenterButton);
    shortcutsGroup.add(tileWindowToCenterActionRow);

    const tileWindowToLeftButton = new Gtk.Button({
      name: "shortcut-tile-window-to-left",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToLeftActionRow = new Adw.ActionRow({
      title: _("Tile Window to Left"),
      subtitle: _("Shortcut to tile the active window to left."),
    });
    tileWindowToLeftActionRow.add_suffix(tileWindowToLeftButton);
    shortcutsGroup.add(tileWindowToLeftActionRow);

    const tileWindowToRightButton = new Gtk.Button({
      name: "shortcut-tile-window-to-right",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToRightActionRow = new Adw.ActionRow({
      title: _("Tile Window to Right"),
      subtitle: _("Shortcut to tile the active window to right."),
    });
    tileWindowToRightActionRow.add_suffix(tileWindowToRightButton);
    shortcutsGroup.add(tileWindowToRightActionRow);

    const tileWindowToTopButton = new Gtk.Button({
      name: "shortcut-tile-window-to-top",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToTopActionRow = new Adw.ActionRow({
      title: _("Tile Window to Top"),
      subtitle: _("Shortcut to tile the active window to top."),
    });
    tileWindowToTopActionRow.add_suffix(tileWindowToTopButton);
    shortcutsGroup.add(tileWindowToTopActionRow);

    const tileWindowToBottomButton = new Gtk.Button({
      name: "shortcut-tile-window-to-bottom",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToBottomActionRow = new Adw.ActionRow({
      title: _("Tile Window to Bottom"),
      subtitle: _("Shortcut to tile the active window to bottom."),
    });
    tileWindowToBottomActionRow.add_suffix(tileWindowToBottomButton);
    shortcutsGroup.add(tileWindowToBottomActionRow);

    const tileWindowToTopLeftButton = new Gtk.Button({
      name: "shortcut-tile-window-to-top-left",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToTopLeftActionRow = new Adw.ActionRow({
      title: _("Tile Window to Top Left"),
      subtitle: _("Shortcut to tile the active window to top left."),
    });
    tileWindowToTopLeftActionRow.add_suffix(tileWindowToTopLeftButton);
    shortcutsGroup.add(tileWindowToTopLeftActionRow);

    const tileWindowToTopRightButton = new Gtk.Button({
      name: "shortcut-tile-window-to-top-right",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToTopRightActionRow = new Adw.ActionRow({
      title: _("Tile Window to Top Right"),
      subtitle: _("Shortcut to tile the active window to top right."),
    });

    tileWindowToTopRightActionRow.add_suffix(tileWindowToTopRightButton);
    shortcutsGroup.add(tileWindowToTopRightActionRow);

    const tileWindowToBottomLeftButton = new Gtk.Button({
      name: "shortcut-tile-window-to-bottom-left",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToBottomLeftActionRow = new Adw.ActionRow({
      title: _("Tile Window to Bottom Left"),
      subtitle: _("Shortcut to tile the active window to bottom left."),
    });
    tileWindowToBottomLeftActionRow.add_suffix(tileWindowToBottomLeftButton);
    shortcutsGroup.add(tileWindowToBottomLeftActionRow);

    const tileWindowToBottomRightButton = new Gtk.Button({
      name: "shortcut-tile-window-to-bottom-right",
      valign: Gtk.Align.CENTER,
    });
    const tileWindowToBottomRightActionRow = new Adw.ActionRow({
      title: _("Tile Window to Bottom Right"),
      subtitle: _("Shortcut to tile the active window to bottom right."),
    });
    tileWindowToBottomRightActionRow.add_suffix(tileWindowToBottomRightButton);
    shortcutsGroup.add(tileWindowToBottomRightActionRow);

    this.bindShortcutSettings([
      workspaceSwitchLeftButton,
      workspaceSwitchRightButton,
      workspaceMoveLeftButton,
      workspaceMoveRightButton,
      linkedResizeShortcutButton,
      alignWindowToCenterButton,
      incrementGapSizeButton,
      decreaseGapSizeButton,
      tileWindowToCenterButton,
      tileWindowToLeftButton,
      tileWindowToRightButton,
      tileWindowToTopButton,
      tileWindowToBottomButton,
      tileWindowToTopLeftButton,
      tileWindowToTopRightButton,
      tileWindowToBottomLeftButton,
      tileWindowToBottomRightButton,
    ]);

    return shortcutsGroup;
  }

  private bindShortcutSettings(widgets: Gtk.Button[]) {
    const { settings } = this;

    widgets.forEach((widget) => {
      settings.connect("changed::" + widget.get_name(), () => {
        this.reloadShortcutWidget(widget);
      });
      widget.connect("clicked", () => {
        this.onAssignShortcut(widget);
      });
    });
    this.reloadShortcutWidgets(widgets);
  }

  private onAssignShortcut(widget: Gtk.Button) {
    const { window, settings } = this;
    const dialog = new ShortcutDialog(this.path, settings, widget.get_name());
    dialog.present(window);
  }

  private reloadShortcutWidget(widget: Gtk.Button) {
    const { settings } = this;
    const shortcut = settings.get_strv(widget.get_name());
    if (shortcut?.length > 0) {
      const [ok, keyval, mods] = Gtk.accelerator_parse(shortcut[0]);
      widget.label = ok && mods !== null ? Gtk.accelerator_get_label(keyval, mods) : shortcut[0];
    } else {
      widget.label = _("Disabled");
    }
  }

  private reloadShortcutWidgets(widgets: Gtk.Button[]) {
    widgets.forEach((widget) => {
      this.reloadShortcutWidget(widget);
    });
  }

  private onShowNumpadFixDialog() {
    const { window, settings } = this;

    const dialog = new Adw.MessageDialog({
      transient_for: window,
      heading: _("Fix Numpad 9 and Numpad 3"),
      body: _(
        "Default workspace shortcuts (Super + Page Up/Down) conflict with this extension on keyboards where Numpad 9 and 3 share those keys. Enabling this fix overrides system defaults to ensure proper numpad tiling.",
      ),
    });

    const switchRow = new Adw.SwitchRow({
      title: _("Enable Override"),
    });
    settings.bind(
      "override-system-keybindings",
      switchRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    dialog.set_extra_child(switchRow);
    dialog.add_response("close", _("Close"));
    dialog.present();
  }

  private createAboutPage() {
    const aboutPage = new Adw.PreferencesPage({
      title: _("About"),
      icon_name: "help-about-symbolic",
    });

    const aboutGroup = new Adw.PreferencesGroup();
    aboutPage.add(aboutGroup);

    const iconBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 24,
      margin_bottom: 24,
      hexpand: true,
      halign: Gtk.Align.CENTER,
    });

    const iconPath = GLib.build_filenamev([this.path, "icon.svg"]);
    const icon = new Gtk.Image({
      file: iconPath,
      pixel_size: 128,
      halign: Gtk.Align.CENTER,
    });
    iconBox.append(icon);

    const nameLabel = new Gtk.Label({
      label: "Awesome Tiles",
      css_classes: ["title-1"],
      halign: Gtk.Align.CENTER,
    });
    iconBox.append(nameLabel);

    const descriptionLabel = new Gtk.Label({
      label: _(
        "A powerful tiling manager for GNOME Shell. Precision tile windows into 9 positions using the number pad, enjoy dynamic grid sizes that cycle on repeated keystrokes, and experience seamless linked resizing for adjacent windows. Includes customizable gaps, center alignment, and integrated workspace navigation.",
      ),
      wrap: true,
      justify: Gtk.Justification.CENTER,
      max_width_chars: 60,
      halign: Gtk.Align.CENTER,
    });
    iconBox.append(descriptionLabel);

    // Add the header box directly to the group instead of using set_header_child
    aboutGroup.add(iconBox);

    const authorsGroup = new Adw.PreferencesGroup({
      title: _("Authors"),
    });
    aboutPage.add(authorsGroup);

    const authors = [
      {
        name: "Pim Snel",
        role: _("Original Author"),
        link: "https://github.com/mipmip",
      },
      {
        name: "Veli Tasalı",
        role: _("Author"),
        link: "https://github.com/velitasali",
      },
    ];

    authors.forEach((author) => {
      const row = new Adw.ActionRow({
        title: author.name,
        subtitle: author.role,
        activatable: true,
      });
      row.add_suffix(new Gtk.Image({ icon_name: "external-link-symbolic" }));
      row.connect("activated", () => {
        Gtk.show_uri(null, author.link, Gdk.CURRENT_TIME);
      });
      authorsGroup.add(row);
    });

    const contributorsGroup = new Adw.PreferencesGroup({
      title: _("Contributors"),
    });
    aboutPage.add(contributorsGroup);

    const contributors = [
      { name: "qwreey", link: "https://github.com/qwreey" },
      {
        name: "Samet Güzeldemirci",
        role: _("Contributor"),
        link: "https://github.com/samex",
      },
      { name: "mhecher-sc", link: "https://github.com/mhecher-sc" },
      { name: "FedericoCalzoni", link: "https://github.com/FedericoCalzoni" },
      { name: "Dolland", link: "https://github.com/Dolland" },
      { name: "Vistaus", link: "https://github.com/Vistaus" },
      { name: "nushoin", link: "https://github.com/nushoin" },
      { name: "lazydays79", link: "https://github.com/lazydays79" },
      { name: "guillaumecle", link: "https://github.com/guillaumecle" },
      { name: "Chake96", link: "https://github.com/Chake96" },
      { name: "Soupolait", link: "https://github.com/Soupolait" },
    ];

    contributors.forEach((contributor) => {
      const row = new Adw.ActionRow({
        title: contributor.name,
        activatable: true,
      });
      row.add_suffix(new Gtk.Image({ icon_name: "external-link-symbolic" }));
      row.connect("activated", () => {
        Gtk.show_uri(null, contributor.link, Gdk.CURRENT_TIME);
      });
      contributorsGroup.add(row);
    });

    const linksGroup = new Adw.PreferencesGroup({
      title: _("Links"),
    });
    aboutPage.add(linksGroup);

    const ghRow = new Adw.ActionRow({
      title: _("GitHub Repository"),
      activatable: true,
    });
    ghRow.add_suffix(new Gtk.Image({ icon_name: "external-link-symbolic" }));
    ghRow.connect("activated", () => {
      Gtk.show_uri(
        null,
        "https://github.com/velitasali/gnome-shell-extension-awesome-tiles",
        Gdk.CURRENT_TIME,
      );
    });
    linksGroup.add(ghRow);

    const egoRow = new Adw.ActionRow({
      title: _("GNOME Extensions Page"),
      activatable: true,
    });
    egoRow.add_suffix(new Gtk.Image({ icon_name: "external-link-symbolic" }));
    egoRow.connect("activated", () => {
      Gtk.show_uri(
        null,
        "https://extensions.gnome.org/extension/4702/awesome-tiles/",
        Gdk.CURRENT_TIME,
      );
    });
    linksGroup.add(egoRow);

    return aboutPage;
  }
}

class ShortcutDialog {
  private builder: Gtk.Builder = new Gtk.Builder();
  private widget: Adw.Window;

  constructor(
    path: string,
    private readonly settings: Gio.Settings,
    private readonly shortcut: string,
  ) {
    this.builder.add_from_file(GLib.build_filenamev([path, "prefs-shortcut-dialog.ui"]));

    this.widget = this.builder.get_object<Adw.Window>("dialog");

    this.connectSettings();
  }

  present(window: Gtk.Window) {
    this.widget.set_transient_for(window);
    this.widget.present();
  }

  private connectSettings() {
    const { settings, shortcut } = this;

    const eventController = this.builder.get_object<Gtk.EventControllerKey>("event-controller");
    eventController.connect("key-pressed", (_widget, keyval, keycode, state) => {
      let mask = state & Gtk.accelerator_get_default_mod_mask();
      mask &= ~Gdk.ModifierType.LOCK_MASK;

      if (mask === 0 && keyval === Gdk.KEY_Escape) {
        this.widget.visible = false;
        return Gdk.EVENT_STOP;
      }

      if (keyval === Gdk.KEY_BackSpace) {
        settings.set_strv(shortcut, []);
        this.widget.close();
      } else if (
        Utils.isBindingValid({ mask, keycode, keyval }) &&
        Utils.isAccelValid({ mask, keyval })
      ) {
        const binding = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        settings.set_strv(shortcut, [binding]);
        this.widget.close();
      }

      return Gdk.EVENT_STOP;
    });
  }
}
