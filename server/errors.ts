export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const badRequest = (code = 'invalid_input', details?: Record<string, unknown>) =>
  new ApiError(400, code, details);
export const unauthorized = (code = 'unauthorized') => new ApiError(401, code);
export const forbidden = () => new ApiError(403, 'forbidden');
export const notFound = () => new ApiError(404, 'not_found');
