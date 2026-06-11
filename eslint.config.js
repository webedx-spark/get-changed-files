// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin')
const tsparser = require('@typescript-eslint/parser')
const jest = require('eslint-plugin-jest')
const prettier = require('eslint-plugin-prettier')

module.exports = [
  {
    ignores: ['dist/**', 'lib/**', 'node_modules/**']
  },
  {
    files: ['src/**/*.ts', '__tests__/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        node: true,
        es2022: true,
        ...jest.environments.globals.globals
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      jest,
      prettier
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true}],
      'no-unused-vars': 'off'
    }
  }
]
