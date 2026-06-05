import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // 사주 API 페이로드는 느슨한 구조라 any를 의도적으로 사용한다. 빌드 차단 대신 경고로 둔다.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
