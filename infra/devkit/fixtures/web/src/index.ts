// Web API utilities
export interface User {
  id: number
  name: string
  email: string
}

export interface ApiResponse<T> {
  data: T
  status: number
  message: string
}

export class UserService {
  private baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
  }

  async getUsers(): Promise<ApiResponse<User[]>> {
    const response = await fetch(`${this.baseUrl}/users`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      data,
      status: response.status,
      message: 'Users retrieved successfully'
    }
  }

  async getUser(id: number): Promise<ApiResponse<User>> {
    const response = await fetch(`${this.baseUrl}/users/${id}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      data,
      status: response.status,
      message: 'User retrieved successfully'
    }
  }

  async createUser(user: Omit<User, 'id'>): Promise<ApiResponse<User>> {
    const response = await fetch(`${this.baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      data,
      status: response.status,
      message: 'User created successfully'
    }
  }
}

// DOM utilities
export class DOMUtils {
  static createElement<T extends keyof HTMLElementTagNameMap>(
    tagName: T,
    attributes: Record<string, string> = {},
    textContent?: string
  ): HTMLElementTagNameMap[T] {
    const element = document.createElement(tagName)

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value)
    })

    if (textContent) {
      element.textContent = textContent
    }

    return element
  }

  static addClass(element: HTMLElement, className: string): void {
    element.classList.add(className)
  }

  static removeClass(element: HTMLElement, className: string): void {
    element.classList.remove(className)
  }

  static toggleClass(element: HTMLElement, className: string): void {
    element.classList.toggle(className)
  }
}

// Event utilities
export class EventBus {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map()

  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: (...args: any[]) => void): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(callback)
    }
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(callback => callback(...args))
    }
  }
}

export const VERSION = 'web-fixture'
