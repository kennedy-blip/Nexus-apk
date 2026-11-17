import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** Flat config: Next 16 ships native flat presets, no compat layer needed. */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "backend/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // <img> is intentional for authenticated icon/stream proxies that the
      // Next image optimizer cannot reach.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
