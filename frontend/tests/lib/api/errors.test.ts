import { describe, expect, test } from 'bun:test';
import { ApiError, isApiError } from '@/lib/api/errors';

describe('ApiError', () => {
  test('carries status, message, code and body', () => {
    const body = { field: 'name' };
    const err = new ApiError(422, 'Invalid', 'VALIDATION_ERROR', body);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Invalid');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.body).toBe(body);
  });

  test('code and body are optional', () => {
    const err = new ApiError(500, 'Boom');

    expect(err.code).toBeUndefined();
    expect(err.body).toBeUndefined();
  });

  test('isApiError narrows only ApiError instances', () => {
    expect(isApiError(new ApiError(404, 'Not found'))).toBe(true);
    expect(isApiError(new Error('plain'))).toBe(false);
    expect(isApiError({ status: 404, message: 'Not found' })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
