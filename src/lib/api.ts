import type { ApiErrorBody } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, error?.code ?? 'generic', error?.details ?? {});
  }
  return data as T;
}

export const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : 'generic');
