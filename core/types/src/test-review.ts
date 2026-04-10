// Test file for AI Review - Pyramid Rule validation

// GOOD: Follows Pyramid Rule
export interface IUserConfig {
  name: string;
  email: string;
}

// BAD: Missing I prefix (should be detected by naming analyzer)
export interface UserPreferences {
  theme: string;
  language: string;
}

// GOOD: Proper naming
export class UserService {
  constructor(private config: IUserConfig) {}
}

// Test function
export function processUserData(data: unknown): void {
  console.log(data);
}
