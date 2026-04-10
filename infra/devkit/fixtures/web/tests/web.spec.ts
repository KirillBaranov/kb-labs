import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserService, DOMUtils, EventBus, VERSION } from '../src'

// Mock fetch for testing
global.fetch = vi.fn()

describe('Web fixture', () => {
  describe('UserService', () => {
    let userService: UserService

    beforeEach(() => {
      userService = new UserService('/test-api')
      vi.clearAllMocks()
    })

    it('should create user service with default base URL', () => {
      const service = new UserService()
      expect(service).toBeInstanceOf(UserService)
    })

    it('should get users successfully', async () => {
      const mockUsers = [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
      ]

        ; (fetch as any).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockUsers
        })

      const result = await userService.getUsers()

      expect(result.data).toEqual(mockUsers)
      expect(result.status).toBe(200)
      expect(result.message).toBe('Users retrieved successfully')
      expect(fetch).toHaveBeenCalledWith('/test-api/users')
    })

    it('should handle fetch errors', async () => {
      ; (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      await expect(userService.getUsers()).rejects.toThrow('HTTP error! status: 404')
    })
  })

  describe('DOMUtils', () => {
    it('should create element with attributes', () => {
      const element = DOMUtils.createElement('div', { id: 'test', class: 'container' }, 'Hello World')

      expect(element.tagName).toBe('DIV')
      expect(element.id).toBe('test')
      expect(element.className).toBe('container')
      expect(element.textContent).toBe('Hello World')
    })

    it('should add and remove classes', () => {
      const element = DOMUtils.createElement('div')

      DOMUtils.addClass(element, 'active')
      expect(element.classList.contains('active')).toBe(true)

      DOMUtils.removeClass(element, 'active')
      expect(element.classList.contains('active')).toBe(false)

      DOMUtils.toggleClass(element, 'active')
      expect(element.classList.contains('active')).toBe(true)
    })
  })

  describe('EventBus', () => {
    let eventBus: EventBus

    beforeEach(() => {
      eventBus = new EventBus()
    })

    it('should emit and listen to events', () => {
      const callback = vi.fn()
      eventBus.on('test-event', callback)

      eventBus.emit('test-event', 'data1', 'data2')

      expect(callback).toHaveBeenCalledWith('data1', 'data2')
    })

    it('should remove event listeners', () => {
      const callback = vi.fn()
      eventBus.on('test-event', callback)
      eventBus.off('test-event', callback)

      eventBus.emit('test-event', 'data')

      expect(callback).not.toHaveBeenCalled()
    })
  })

  it('should expose version', () => {
    expect(VERSION).toBe('web-fixture')
  })
})
