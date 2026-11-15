import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    // `dist` é artefato de build e o deck é HTML estático
    ignores: ['dist', 'node_modules', 'public', 'apresentacao', 'scripts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // O projeto usa `void promise` de propósito para sinalizar efeitos
      // intencionalmente não aguardados (invalidateQueries, logAudit).
      '@typescript-eslint/no-floating-promises': 'off',

      // Permite `_` como prefixo para argumentos deliberadamente não usados.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `any` explícito deve ser exceção justificada, não regra.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Componentes exportados junto de constantes são um padrão do projeto;
      // o aviso de fast-refresh não agrega aqui.
      'react-refresh/only-export-components': 'off',
    },
  },
)
