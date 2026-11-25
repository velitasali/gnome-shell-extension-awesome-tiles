// @ts-check
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["build/**", "node_modules/**"],
  },
  tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Allow underscore-prefixed names to opt out of the unused-vars rule,
      // which is handy for intentionally-ignored parameters in callbacks.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Non-null assertions are common and intentional in GNOME Shell extensions.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
