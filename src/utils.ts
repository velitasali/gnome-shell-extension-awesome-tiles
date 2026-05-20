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

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isRectEqual(lhs: Rect, rhs: Rect): boolean {
  return lhs.x === rhs.x && lhs.y === rhs.y && lhs.width === rhs.width && lhs.height === rhs.height;
}

export function parseTilingSteps(value: string, defaultValue: number[][]): number[][] {
  try {
    return value.split(",").map((step) => {
      const numbers = step.split(";").map((str) => {
        const number = Math.max(0.0, Math.min(1.0, parseFloat(str.trim())));
        if (isNaN(number) || typeof number !== "number") {
          throw new Error("Expected a number");
        }
        return number;
      });
      return numbers;
    });
  } catch {
    return defaultValue;
  }
}
