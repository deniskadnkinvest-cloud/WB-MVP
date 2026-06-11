import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'scratch',
    'playwright-report',
    'test-results',
    'videos',
    '*.png',
    'chrome.log',
    'test_out.txt',
  ]),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^(React|motion|AnimatePresence|[A-Z_].*)$',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['api/**/*.js', 'server*.js', 'models.js', 'playwright.config.js', 'test*.js', 'tests/**/*.js', '*.cjs'],
    extends: [
      js.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
])
