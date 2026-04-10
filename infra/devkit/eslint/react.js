import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import unicorn from 'eslint-plugin-unicorn'

export default [
  // ---- ignore common build artifacts and generated files
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.yalc/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/scripts/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/vitest-setup.ts',
      '**/vitest.setup.ts',
      '**/tsup.config.bundled_*.mjs'
    ]
  },

  // ---- base TypeScript recommendations
  ...tseslint.configs.recommended,

  // ---- project-wide rules and import resolver
  {
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      unicorn: unicorn,
    },
    settings: {
      // Let eslint-plugin-import resolve TS paths and packages without extensions
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.json'],
        },
      },
    },
    languageOptions: {
      // Enable type-aware capabilities when available without forcing per-repo setup
      parserOptions: {
        projectService: true,
      },
      // Define globals for browser and Node.js environments
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        EventSource: 'readonly',
        MessageEvent: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        crypto: 'readonly',

        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',

        // TypeScript globals
        NodeJS: 'readonly',

        // React/JSX globals
        JSX: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        React: 'readonly',

        // Browser APIs
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        RequestInit: 'readonly',
      },
    },
    rules: {
      // Never use .ts/.tsx extensions, always use .js/.json extensions
      'import/extensions': ['error', 'never', {
        'js': 'always',
        'json': 'always'
      }],

      // Allow dev dependencies in tests, configs and scripts
      'import/no-extraneous-dependencies': ['error', {
        devDependencies: [
          '**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}',
          '**/__tests__/**',
          '**/vite.config.*',
          '**/vitest.config.*',
          '**/tsup.config.*',
          '**/eslint.config.*',
          '**/scripts/**',
        ],
      }],

      // TS ergonomics
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off', // Allow empty interfaces (will be extended in future)
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // CRITICAL: Catch undefined variables (missing imports)
      'no-undef': 'error',

      // Naming conventions
      '@typescript-eslint/naming-convention': [
        'error',
        // Interfaces: PascalCase with optional I prefix
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I?[A-Z]',
            match: true,
          },
        },
        // Type aliases: PascalCase
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        // Enums: PascalCase
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        // Classes: PascalCase
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        // Variables: camelCase or UPPER_CASE (for constants)
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Functions: camelCase or PascalCase (for React components)
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        // Parameters: camelCase or PascalCase (for React component parameters)
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Properties: camelCase, UPPER_CASE, or PascalCase
        // Allow __html (React dangerouslySetInnerHTML), 2xl (Tailwind), and kebab-case for HTTP headers
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          filter: {
            // Allow:
            // - __html, __[a-z]+ (React internals)
            // - --cols-sm, --text-primary (CSS variables)
            // - 2xl, 5m, 10m (Tailwind sizes, time units)
            // - kebab-case: chart-line, date-picker, gpt-4, claude-3-sonnet, gpt-3.5-turbo
            // - snake_case: error_rate, plugin_failure
            // - PascalCase-kebab: Header-Content
            // - percentages: 0%, 100%
            // - numeric: 50, 100, 200, 404, 500 (HTTP status codes, color values)
            regex: '^(__|--)[a-z0-9-]+$|^[0-9]+[a-z]+$|^[a-z]+(-[a-z0-9.]+)+$|^[a-z]+(_[a-z]+)+$|^([A-Z][a-z]+-)*[A-Z][a-z]+$|^[0-9]+%$|^[0-9]+$',
            match: false,
          },
        },
        // Methods: camelCase or PascalCase (for mocked React components in tests)
        {
          selector: 'method',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      // General safety / clarity
      'no-console': 'off',
      'no-debugger': 'warn',
      'eqeqeq': ['error', 'smart'],
      'curly': ['error', 'all'],

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // JSX A11y basics
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',

      // File naming conventions
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            // React components: PascalCase (MyComponent.tsx)
            // React hooks: camelCase (useHook.ts) - matched by camelCase
            // Utility files: kebab-case (my-util.ts)
            // Config files: kebab-case (tsup.config.ts)
            // Test files: kebab-case (my-component.test.tsx)
            kebabCase: true,
            pascalCase: true,
            camelCase: true,
          },
          ignore: [
            // Allow common patterns
            '^.*\\.config\\.(ts|js|mjs|cjs)$',
            '^.*\\.test\\.(ts|tsx|js|jsx)$',
            '^.*\\.spec\\.(ts|tsx|js|jsx)$',
            '^README\\.md$',
            '^CHANGELOG\\.md$',
            '^LICENSE$',
            // Allow UI prefix pattern (UIButton.tsx, UICard.tsx, etc.)
            '^UI[A-Z].*\\.(ts|tsx|js|jsx)$',
          ],
        },
      ],
    },
  },

  // ---- minimal .vue support (without forcing Vue plugin)
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { extraFileExtensions: ['.vue'] },
    },
  },

  // ---- config files: allow .js extensions for ESM compatibility
  {
    files: ['**/*.config.{ts,js,mjs,cjs}', '**/tsup.config.ts', '**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      'import/extensions': 'off',
    },
  },
]

