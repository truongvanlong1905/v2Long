import type { ApiErrorPayload, ApiSuccess } from '@toantrung/contracts';

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    csrfToken?: string;
    isFormData?: boolean;
  } = {},
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};

  if (!options.isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.csrfToken && method !== 'GET') {
    headers['x-csrf-token'] = options.csrfToken;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const payload = (await res.json().catch(() => null)) as
    | ApiSuccess<T>
    | ApiErrorPayload
    | null;

  if (!res.ok || !payload || 'error' in payload) {
    const errObj = payload && 'error' in payload ? payload.error : null;
    throw new ApiClientError(
      errObj?.code || 'HTTP_ERROR',
      errObj?.message || `Yêu cầu thất bại (Mã ${res.status}).`,
      res.status,
      errObj?.requestId,
    );
  }

  return payload.data;
}

