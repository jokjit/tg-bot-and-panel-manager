import globals from 'globals';

const runtimeGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.worker,
  HTMLRewriter: 'readonly',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'worker.bundle.js',
      'mobile-app/public/deploy-assets/**',
      'mobile-app/android/**',
      'admin-panel/public/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: runtimeGlobals,
    },
    rules: {
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-keys': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-undef': 'error',
      'no-unexpected-multiline': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
