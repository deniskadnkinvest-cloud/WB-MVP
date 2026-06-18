import js from '@eslint/js';

export default [
  {
    files: ['api/**/*.js'],
    ...js.configs.recommended,
    rules: {
      // Синтаксические правила — ловим ошибки до деплоя
      'no-undef': 'off',           // API файлы используют Node.js глобалы
      'no-unused-vars': 'warn',    // Предупреждение, не ошибка
      'no-unreachable': 'error',   // Код после return/throw — ошибка
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-template-curly-in-string': 'warn', // Забытые ${} в обычных строках
      'no-unexpected-multiline': 'error',    // Неожиданные многострочные выражения
      'valid-typeof': 'error',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        setInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      }
    }
  },
  {
    // Игнорируем внутренние helper-файлы (они импортируются, не проверяются отдельно)
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vercel/**',
      'api/_*.js',   // _firebase-admin.js, _admin-alerts.js и т.д.
    ]
  }
];
