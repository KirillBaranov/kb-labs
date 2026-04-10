import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ConsoleLogger,
  ConfigManager,
  ValidationError,
  validateEmail,
  validateRequired,
  validateMinLength,
  VERSION
} from '../src'

describe('Shared fixture', () => {
  describe('ConsoleLogger', () => {
    let logger: ConsoleLogger
    let consoleSpy: any

    beforeEach(() => {
      logger = new ConsoleLogger('[TEST] ')
      consoleSpy = {
        log: vi.spyOn(console, 'log'),
        warn: vi.spyOn(console, 'warn'),
        error: vi.spyOn(console, 'error'),
        debug: vi.spyOn(console, 'debug'),
      }
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should log info messages', () => {
      logger.info('Test message', { data: 'test' })
      expect(consoleSpy.log).toHaveBeenCalledWith('[INFO] [TEST] Test message', { data: 'test' })
    })

    it('should log warning messages', () => {
      logger.warn('Warning message')
      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] [TEST] Warning message')
    })

    it('should log error messages', () => {
      logger.error('Error message')
      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] [TEST] Error message')
    })

    it('should log debug messages', () => {
      logger.debug('Debug message')
      expect(consoleSpy.debug).toHaveBeenCalledWith('[DEBUG] [TEST] Debug message')
    })
  })

  describe('ConfigManager', () => {
    it('should use default config', () => {
      const config = new ConfigManager()
      expect(config.get('environment')).toBe('development')
      expect(config.get('debug')).toBe(false)
      expect(config.get('apiUrl')).toBe('https://api.example.com')
      expect(config.get('timeout')).toBe(5000)
    })

    it('should use custom config', () => {
      const config = new ConfigManager({
        environment: 'production',
        debug: true,
        apiUrl: 'https://custom.api.com'
      })
      expect(config.get('environment')).toBe('production')
      expect(config.get('debug')).toBe(true)
      expect(config.get('apiUrl')).toBe('https://custom.api.com')
    })

    it('should set and get values', () => {
      const config = new ConfigManager()
      config.set('timeout', 10000)
      expect(config.get('timeout')).toBe(10000)
    })

    it('should check environment', () => {
      const devConfig = new ConfigManager({ environment: 'development' })
      const prodConfig = new ConfigManager({ environment: 'production' })

      expect(devConfig.isDevelopment()).toBe(true)
      expect(devConfig.isProduction()).toBe(false)
      expect(prodConfig.isDevelopment()).toBe(false)
      expect(prodConfig.isProduction()).toBe(true)
    })
  })

  describe('Validation utilities', () => {
    it('should validate email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user.name@domain.co.uk')).toBe(true)
      expect(validateEmail('invalid-email')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('test@')).toBe(false)
    })

    it('should validate required fields', () => {
      expect(() => validateRequired('value', 'field')).not.toThrow()
      expect(() => validateRequired(0, 'field')).not.toThrow()
      expect(() => validateRequired(false, 'field')).not.toThrow()

      expect(() => validateRequired('', 'field')).toThrow(ValidationError)
      expect(() => validateRequired(null, 'field')).toThrow(ValidationError)
      expect(() => validateRequired(undefined, 'field')).toThrow(ValidationError)
    })

    it('should validate minimum length', () => {
      expect(() => validateMinLength('hello', 3, 'field')).not.toThrow()
      expect(() => validateMinLength('hi', 3, 'field')).toThrow(ValidationError)
    })

    it('should create ValidationError with field name', () => {
      const error = new ValidationError('Test error', 'testField')
      expect(error.message).toBe('Test error')
      expect(error.field).toBe('testField')
      expect(error.name).toBe('ValidationError')
    })
  })

  it('should expose version', () => {
    expect(VERSION).toBe('shared-fixture')
  })
})
