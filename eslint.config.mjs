import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: { project: false } },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read env only in config.ts (invariant I7: one config funnel).',
        },
      ],
    },
  },
  {
    files: ['**/config.ts', '**/*.test.ts', '**/*.bench.ts', 'examples/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
];
