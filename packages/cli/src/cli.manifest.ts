import { validateCommand } from './config/validate.js';

export const cliManifest = {
  commands: {
    'config validate': {
      description: 'Validate product configuration',
      handler: validateCommand,
      options: {
        product: {
          type: 'string',
          description: 'Product ID to validate',
          required: true
        },
        profile: {
          type: 'string',
          description: 'Profile key to use'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    }
  }
};