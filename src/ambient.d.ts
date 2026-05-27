// ambient.d.ts
import "@girs/gjs";
import "@girs/gnome-shell/ambient"; // augments Clutter.Actor with ease/ease_property
import "@girs/gnome-shell/extensions/global"; // shell globals (global, _, etc.)

// The upstream @girs/gnome-shell EasingParamsWithProperties only lists camelCase
// property names, but the Clutter runtime actually resolves the snake_case GObject
// property names (e.g. translation_x, scale_x). We add a new ease() overload here
// that explicitly includes the snake_case variants that are verified to work at runtime.
//
// EasingParamsWithProperties is defined at module scope inside global.d.ts (not
// exported), so it cannot be augmented from the outside. Augmenting the Actor
// interface directly is the correct approach.
type _ClutterEasingParams = {
  duration?: number;
  delay?: number;
  mode?: import("@girs/clutter-18/clutter-18").Clutter.AnimationMode;
  repeatCount?: number;
  autoReverse?: boolean;
  onComplete?: () => void;
  onStopped?: (isFinished: boolean) => void;
  // camelCase variants (for completeness)
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  translationX?: number;
  translationY?: number;
  translationZ?: number;
  rotationAngleX?: number;
  rotationAngleY?: number;
  rotationAngleZ?: number;
  // snake_case GObject property names (what actually works at runtime)
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
  translation_x?: number;
  translation_y?: number;
  translation_z?: number;
  rotation_angle_x?: number;
  rotation_angle_y?: number;
  rotation_angle_z?: number;
  fixed_x?: number;
  fixed_y?: number;
  margin_bottom?: number;
  margin_left?: number;
  margin_right?: number;
  margin_top?: number;
  min_height?: number;
  min_width?: number;
  natural_height?: number;
  natural_width?: number;
  pivot_point_z?: number;
  z_position?: number;
};

declare module "@girs/clutter-18/clutter-18" {
  export namespace Clutter {
    interface Actor {
      ease(props: _ClutterEasingParams): void;
    }
  }
}
