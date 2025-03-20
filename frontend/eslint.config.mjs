import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      'react-hooks/exhaustive-deps': 'off',
      "@typescript-eslint/no-unused-vars": "off",
      "import/no-anonymous-default-export": "off",
      "@next/next/no-before-interactive-script-outside-document": "off",
      "@next/next/no-sync-scripts": "off",
      'react-hooks/exhaustive-deps': 'off',
      "@typescript-eslint/no-unused-vars": "off",
      "import/no-anonymous-default-export": "off",
      "@next/next/no-before-interactive-script-outside-document": "off",
      "@next/next/no-sync-scripts": "off",
      "@next/next/no-html-link-for-pages": "off", // Disable useSearchParams warning
    },
  },
];

export default eslintConfig;
