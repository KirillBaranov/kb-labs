import preset from '@kb-labs/devkit/eslint/node'

export default [
  ...preset,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        allowDefaultProject: true,
      },
    },
  },
]
