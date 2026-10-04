import type { ApiErrorResponse } from '@ai-crm/shared';

const API_BASE = '/api';

/**
 * API client with credentials:'include' for httpOnly cookie auth.
 * On 401, tries /auth/refresh once before throwing.
 */
class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  private getCsrfToken(): string | null {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match?.[1] ?? null;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    config: { redirectOnUnauthorized?: boolean } = {},
  ): Promise<T> {
    const redirectOnUnauthorized = config.redirectOnUnauthorized ?? true;
    const headers = new Headers(options.headers);

    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Add CSRF header for state-changing requests
    const method = options.method?.toUpperCase() ?? 'GET';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = this.getCsrfToken();
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      if (!redirectOnUnauthorized) {
        throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      // Try refresh once
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        // Retry original request
        return this.request<T>(path, options);
      }
      // Redirect to login
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const errorBody = (await response.json()) as ApiErrorResponse;
      throw new ApiError(
        errorBody.error.message,
        response.status,
        errorBody.error.code,
        errorBody.error.details,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.isRefreshing) {
      return this.refreshPromise ?? Promise.resolve(false);
    }

    this.isRefreshing = true;
    this.refreshPromise = this.doRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  get<T>(path: string, config?: { redirectOnUnauthorized?: boolean }) {
    return this.request<T>(path, { method: 'GET' }, config);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  upload<T>(path: string, formData: FormData) {
    const csrfToken = this.getCsrfToken();
    const headers = new Headers();
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    return this.request<T>(path, {
      method: 'POST',
      headers,
      body: formData,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const api = new ApiClient();
