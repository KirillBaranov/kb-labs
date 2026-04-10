// emailValidator.spec.ts
import { describe, it, expect } from 'vitest';
import { validateEmail } from '../src/emailValidator';

describe('validateEmail', () => {
    it('should return true for valid email addresses', () => {
        expect(validateEmail('test@example.com')).toBe(true);
        expect(validateEmail('user.name+tag+sorting@example.com')).toBe(true);
    });

    it('should return false for invalid email addresses', () => {
        expect(validateEmail('plainaddress')).toBe(false);
        expect(validateEmail('@missingusername.com')).toBe(false);
        expect(validateEmail('username@.com')).toBe(false);
    });
});