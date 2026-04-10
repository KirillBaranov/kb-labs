import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UserService, App } from '../src'
import { ValidationError } from '../../shared/src/index.ts'

describe('App fixture', () => {
  describe('UserService', () => {
    let userService: UserService
    let _consoleSpy: any

    beforeEach(() => {
      userService = new UserService()
      _consoleSpy = {
        log: vi.spyOn(console, 'log'),
        error: vi.spyOn(console, 'error'),
        debug: vi.spyOn(console, 'debug'),
      }
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should validate user data correctly', () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      }

      const user = userService.validateUser(userData)

      expect(user.name).toBe('John Doe')
      expect(user.email).toBe('john@example.com')
      expect(user.age).toBe(30)
      expect(user.id).toBeDefined()
    })

    it('should throw ValidationError for invalid email', () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        age: 30
      }

      expect(() => userService.validateUser(userData)).toThrow(ValidationError)
    })

    it('should throw ValidationError for invalid age', () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: -5
      }

      expect(() => userService.validateUser(userData)).toThrow(ValidationError)
    })

    it('should throw ValidationError for short name', () => {
      const userData = {
        name: 'J',
        email: 'john@example.com',
        age: 30
      }

      expect(() => userService.validateUser(userData)).toThrow(ValidationError)
    })

    it('should create user successfully', async () => {
      const userData = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25
      }

      const user = await userService.createUser(userData)

      expect(user.name).toBe('Jane Smith')
      expect(user.email).toBe('jane@example.com')
      expect(user.age).toBe(25)
      expect(user.id).toBeDefined()
    })

    it('should handle user creation errors', async () => {
      const userData = {
        name: 'J',
        email: 'invalid-email',
        age: 30
      }

      await expect(userService.createUser(userData)).rejects.toThrow(ValidationError)
    })

    it('should return configuration', () => {
      const config = userService.getConfig()

      expect(config).toHaveProperty('environment')
      expect(config).toHaveProperty('debug')
      expect(config).toHaveProperty('apiUrl')
      expect(config).toHaveProperty('timeout')
    })
  })

  describe('App', () => {
    let app: App
    let _consoleSpy: any

    beforeEach(() => {
      app = new App()
      _consoleSpy = {
        log: vi.spyOn(console, 'log'),
        error: vi.spyOn(console, 'error'),
        debug: vi.spyOn(console, 'debug'),
      }
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should initialize successfully', async () => {
      await expect(app.initialize()).resolves.not.toThrow()
    })

    it('should return version', () => {
      expect(app.getVersion()).toBe('app-fixture')
    })
  })
})
