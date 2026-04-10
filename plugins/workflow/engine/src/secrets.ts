export interface SecretProvider {
  resolve(names: string[]): Promise<Record<string, string>>
}

export interface EnvSecretProviderOptions {
  /**
   * Prefix applied when looking up secrets in environment variables.
   * Defaults to `KB_SECRET_`.
   */
  prefix?: string
  /**
   * When true (default), check both plain and prefixed environment variable names.
   */
  allowPlain?: boolean
}

export class EnvSecretProvider implements SecretProvider {
  private readonly prefix: string
  private readonly allowPlain: boolean

  constructor(options: EnvSecretProviderOptions = {}) {
    this.prefix = options.prefix ?? 'KB_SECRET_'
    this.allowPlain = options.allowPlain ?? true
  }

  async resolve(names: string[]): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {}
    for (const name of names) {
      if (!name) {
        continue
      }
      const prefixed = `${this.prefix}${name}`
      const candidates = this.allowPlain
        ? [process.env[name], process.env[prefixed]]
        : [process.env[prefixed]]

      const value = candidates.find((candidate) => typeof candidate === 'string')
      if (typeof value === 'string') {
        resolved[name] = value
      }
    }
    return resolved
  }
}

export function createDefaultSecretProvider(): SecretProvider {
  return new EnvSecretProvider()
}

