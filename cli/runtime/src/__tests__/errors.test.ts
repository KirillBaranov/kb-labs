import { describe, it, expect } from 'vitest';
import {
  CliError,
  CLI_ERROR_CODES,
  EXIT_CODES,
  isCliError,
  mapCliErrorToExitCode,
  serializeCliError,
} from '../errors.js';

describe('CliError', () => {
  it('creates error with code, message, and details', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'file not found', { path: '/x' });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CliError');
    expect(err.code).toBe('E_IO_READ');
    expect(err.message).toBe('file not found');
    expect(err.details).toEqual({ path: '/x' });
  });

  it('has a stack trace', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'boom');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('boom');
  });
});

describe('isCliError', () => {
  it('returns true for CliError instances', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'x');
    expect(isCliError(err)).toBe(true);
  });

  it('returns true for duck-typed CliError objects', () => {
    const duck = { name: 'CliError', code: 'E_IO_READ', message: 'x' };
    expect(isCliError(duck)).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isCliError(new Error('x'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isCliError(null)).toBe(false);
    expect(isCliError(undefined)).toBe(false);
  });

  it('returns false for objects with unknown error codes', () => {
    const fake = { name: 'CliError', code: 'E_UNKNOWN', message: 'x' };
    expect(isCliError(fake)).toBe(false);
  });
});

describe('mapCliErrorToExitCode', () => {
  it('maps E_INVALID_FLAGS to exit code 3', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_INVALID_FLAGS)).toBe(EXIT_CODES.INVALID_FLAGS);
  });

  it('maps E_PREFLIGHT_CANCELLED to exit code 2', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_PREFLIGHT_CANCELLED)).toBe(EXIT_CODES.PREFLIGHT_CANCELLED);
  });

  it('maps E_IO_READ to EX_IOERR (74)', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_READ)).toBe(EXIT_CODES.IO);
  });

  it('maps E_IO_WRITE to EX_IOERR (74)', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_WRITE)).toBe(EXIT_CODES.IO);
  });

  it('maps E_DISCOVERY_CONFIG to EX_CONFIG (78)', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_DISCOVERY_CONFIG)).toBe(EXIT_CODES.CONFIG);
  });

  it('maps E_ENV_MISSING_VAR to EX_CONFIG (78)', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_ENV_MISSING_VAR)).toBe(EXIT_CODES.CONFIG);
  });

  it('maps E_TELEMETRY_EMIT to EX_SOFTWARE (70)', () => {
    expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_TELEMETRY_EMIT)).toBe(EXIT_CODES.SOFTWARE);
  });
});

describe('serializeCliError', () => {
  it('serializes CliError with code and details', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'boom', { path: '/x' });
    const result = serializeCliError(err);

    expect(result).toEqual({
      name: 'CliError',
      message: 'boom',
      code: 'E_IO_READ',
      details: { path: '/x' },
    });
  });

  it('serializes regular Error without code', () => {
    const err = new Error('regular');
    const result = serializeCliError(err);

    expect(result).toEqual({
      name: 'Error',
      message: 'regular',
    });
  });

  it('includes stack when requested', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'boom');
    const result = serializeCliError(err, { includeStack: true });

    expect(result.stack).toBeDefined();
    expect(result.stack).toContain('boom');
  });

  it('excludes stack by default', () => {
    const err = new CliError(CLI_ERROR_CODES.E_IO_READ, 'boom');
    const result = serializeCliError(err);

    expect(result.stack).toBeUndefined();
  });

  it('handles non-Error values gracefully', () => {
    const result = serializeCliError('string error');
    expect(result.message).toBe('string error');
  });
});
