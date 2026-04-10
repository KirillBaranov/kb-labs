// Shared utilities for monorepo packages
export interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
  debug(message: string, ...args: any[]): void
}

export class ConsoleLogger implements Logger {
  private prefix: string

  constructor(prefix: string = '') {
    this.prefix = prefix
  }

  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${this.prefix}${message}`, ...args)
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${this.prefix}${message}`, ...args)
  }

  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${this.prefix}${message}`, ...args)
  }

  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${this.prefix}${message}`, ...args)
  }
}

export interface Config {
  environment: 'development' | 'staging' | 'production'
  debug: boolean
  apiUrl: string
  timeout: number
}

export class ConfigManager {
  private config: Config

  constructor(config: Partial<Config> = {}) {
    this.config = {
      environment: 'development',
      debug: false,
      apiUrl: 'https://api.example.com',
      timeout: 5000,
      ...config
    }
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key]
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value
  }

  getAll(): Config {
    return { ...this.config }
  }

  isDevelopment(): boolean {
    return this.config.environment === 'development'
  }

  isProduction(): boolean {
    return this.config.environment === 'production'
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateRequired(value: any, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName)
  }
}

export function validateMinLength(value: string, minLength: number, fieldName: string): void {
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters long`, fieldName)
  }
}

export const VERSION = 'shared-fixture'
