import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.worktrees/**',
      '.npm-cache/**',
      '.runtime/**',
      '.scratch/**',
    ],
  },
  { files: ['**/*.{js,mjs,ts}'], languageOptions: { globals: globals.node } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
];
