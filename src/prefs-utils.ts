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
import Gtk from "gi://Gtk";

export function isKeyvalForbidden(keyval: number): boolean {
  const forbiddenKeyvals = [
    Gdk.KEY_Home,
    Gdk.KEY_Left,
    Gdk.KEY_Up,
    Gdk.KEY_Right,
    Gdk.KEY_Down,
    Gdk.KEY_Page_Up,
    Gdk.KEY_Page_Down,
    Gdk.KEY_End,
    Gdk.KEY_Tab,
    Gdk.KEY_KP_Enter,
    Gdk.KEY_Return,
    Gdk.KEY_Mode_switch,
  ];
  return forbiddenKeyvals.includes(keyval);
}

export function isBindingValid({
  mask,
  keycode,
  keyval,
}: {
  mask: number;
  keycode: number;
  keyval: number;
}): boolean {
  if ((mask === 0 || mask === Gdk.ModifierType.SHIFT_MASK) && keycode !== 0) {
    if (
      (keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
      (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
      (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
      (keyval >= Gdk.KEY_kana_fullstop && keyval <= Gdk.KEY_semivoicedsound) ||
      (keyval >= Gdk.KEY_Arabic_comma && keyval <= Gdk.KEY_Arabic_sukun) ||
      (keyval >= Gdk.KEY_Serbian_dje && keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
      (keyval >= Gdk.KEY_Greek_ALPHAaccent && keyval <= Gdk.KEY_Greek_omega) ||
      (keyval >= Gdk.KEY_hebrew_doublelowline && keyval <= Gdk.KEY_hebrew_taf) ||
      (keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
      (keyval >= Gdk.KEY_Hangul_Kiyeog && keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
      (keyval === Gdk.KEY_space && mask === 0) ||
      isKeyvalForbidden(keyval)
    )
      return false;
  }
  return true;
}

export function isAccelValid({ mask, keyval }: { mask: number; keyval: number }): boolean {
  return Gtk.accelerator_valid(keyval, mask) || (keyval === Gdk.KEY_Tab && mask !== 0);
}
