import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'wailsjs/**', '_rust/**', 'build/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
)
