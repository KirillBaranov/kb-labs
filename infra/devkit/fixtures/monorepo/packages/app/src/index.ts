import {
  ConsoleLogger,
  ConfigManager,
  ValidationError,
  validateEmail,
  validateRequired,
  type Logger,
  type Config
} from '../../shared/src/index.ts'

export interface User {
  id: number
  name: string
  email: string
  age: number
}

export class UserService {
  private logger: Logger
  private config: ConfigManager

  constructor(config?: Partial<Config>) {
    this.logger = new ConsoleLogger('[UserService] ')
    this.config = new ConfigManager(config)
  }

  validateUser(user: Partial<User>): User {
    this.logger.debug('Validating user data', user)

    // Validate required fields
    validateRequired(user.name, 'name')
    validateRequired(user.email, 'email')
    validateRequired(user.age, 'age')

    // Validate email format
    if (!validateEmail(user.email!)) {
      throw new ValidationError('Invalid email format', 'email')
    }

    // Validate age
    if (user.age! < 0 || user.age! > 150) {
      throw new ValidationError('Age must be between 0 and 150', 'age')
    }

    // Validate name length
    if (user.name!.length < 2) {
      throw new ValidationError('Name must be at least 2 characters long', 'name')
    }

    const validatedUser: User = {
      id: user.id || Date.now(),
      name: user.name!,
      email: user.email!,
      age: user.age!
    }

    this.logger.info('User validation successful', { userId: validatedUser.id })
    return validatedUser
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    this.logger.info('Creating new user', { email: userData.email })

    try {
      const user = this.validateUser(userData)

      // Simulate API call
      await this.simulateApiCall()

      this.logger.info('User created successfully', { userId: user.id })
      return user
    } catch (error) {
      this.logger.error('Failed to create user', { error: error instanceof Error ? error.message : error })
      throw error
    }
  }

  private async simulateApiCall(): Promise<void> {
    const timeout = this.config.get('timeout')
    this.logger.debug(`Simulating API call with timeout: ${timeout}ms`)

    return new Promise((resolve) => {
      setTimeout(resolve, 100) // Simulate network delay
    })
  }

  getConfig(): Config {
    return this.config.getAll()
  }
}

export class App {
  private userService: UserService
  private logger: Logger

  constructor() {
    this.logger = new ConsoleLogger('[App] ')
    this.userService = new UserService({
      environment: 'development',
      debug: true,
      apiUrl: 'https://api.example.com',
      timeout: 3000
    })
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing application')

    try {
      // Test user creation
      const user = await this.userService.createUser({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      })

      this.logger.info('Application initialized successfully', {
        config: this.userService.getConfig(),
        testUser: { id: user.id, name: user.name }
      })
    } catch (error) {
      this.logger.error('Failed to initialize application', {
        error: error instanceof Error ? error.message : error
      })
      throw error
    }
  }

  getVersion(): string {
    return 'app-fixture'
  }
}

export const VERSION = 'app-fixture'
