## [2.21.2] - 2026-04-20

> **@kb-labs/sdk** 2.21.1 → 2.21.2 (minor: new features)

### 🏗️ Core & SDK

- **cli-ui**: Enhances user experience by adding word-wrap and improved error formatting, making it easier to read and understand messages in the command line interface.
- **sdk**: Introduces a new platform client, streamlining access and integration for users, and improves the marketing page for better clarity.
- **sdk**: Provides access to adapter types, allowing developers to utilize predefined interfaces and improve consistency in their applications.
- **sdk**: Adds a runtime context for application logging and a new hook, enabling developers to better manage environment variables and enhance runtime behavior.
- **sdk**: Integrates new development dependencies to resolve local package issues, ensuring smoother development and fewer interruptions.
- **sdk**: Disables tree-shaking to prevent unnecessary import warnings, leading to a cleaner build process and less confusion for users.
- **sdk**: Suppresses warnings related to unused imports during the build process, contributing to a more polished and efficient development experience.
- **sdk**: Updates peer dependency versions to a more flexible range, preventing version conflicts and improving compatibility for users.
- **sdk**: Organizes peer dependencies for better readability and management, making it easier for developers to understand their project's requirements.
- **devkit**: Avoids complications from self-referencing dependencies in the dependency graph and corrects mock platform adapters, resulting in a more reliable development toolkit.

### 🔧 Other

- **docs**: The CLI formatting page has been relocated for easier access, helping users find relevant documentation more efficiently.
- **docs**: The next.config.ts file has been updated to a more modern format, ensuring better compatibility and performance with current tools.
- **web**: The migration of the next.config.ts file to a modern format enhances the website's performance and maintainability, ultimately improving user experience.
- **ci**: Aligning the pnpm-lock file with the updated package.json ensures that users have consistent and reliable package installations, reducing potential errors during setup.
- **general**: Resolving lint errors, test failures, and missing configurations across 10 packages improves overall software stability and reliability, leading to a smoother user experience.