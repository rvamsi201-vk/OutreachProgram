import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, ValidationError } from '../src/errors/index.js';

describe('Error classes', () => {
  it('AppError sets correct properties', () => {
    const error = new AppError('test message', 400, 'TEST_ERROR');
    expect(error.message).toBe('test message');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('NotFoundError returns 404', () => {
    const error = new NotFoundError('Lead', '123');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Lead with id 123 not found');
  });

  it('UnauthorizedError returns 401', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError returns 403', () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('ConflictError returns 409', () => {
    const error = new ConflictError('Duplicate');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('ValidationError returns 400 with details', () => {
    const details = { field: 'email', message: 'invalid' };
    const error = new ValidationError('Invalid input', details);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });
});
