module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: ['eslint:recommended'],
  globals: {
    caches: 'readonly',
    clients: 'readonly',
    self: 'readonly',
    skipWaiting: 'readonly',
  },
  rules: {
    'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^[A-Z]' }],
  },
  overrides: [
    {
      files: ['tests/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs'],
      env: {
        node: true,
      },
    },
  ],
};
