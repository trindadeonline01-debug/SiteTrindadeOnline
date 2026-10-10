import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // app-motoboy é um projeto Expo/React Native separado (seu próprio
    // package.json, tsconfig próprio já excluído na raiz) — as regras
    // desse preset (core-web-vitals, compiler rules) são pensadas pra
    // Next.js/DOM e não fazem sentido pra React Native.
    "app-motoboy/**",
  ]),
]);

export default eslintConfig;
