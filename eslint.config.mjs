import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
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
);
