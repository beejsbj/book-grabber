export const exitCodes = Object.freeze({
  ARGS: 2, CONFIG: 3, AUTH: 4, UPSTREAM: 5, QBIT: 6, STATE: 7, INTERNAL: 8
});

export class AppError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function asAppError(error) {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL', 'Unexpected internal error', { cause: error });
}
