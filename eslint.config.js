import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // The supplied mocks must stay byte-for-byte unchanged, so they are not linted.
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "src/mocks"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  { files: ["*.config.{js,ts}", "e2e/**"], languageOptions: { globals: { ...globals.node } } },
);
