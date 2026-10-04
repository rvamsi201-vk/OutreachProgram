/** Standardized API error response format */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Standardized API success response with pagination */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

/** Auth response types */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  activeOrganization: {
    id: string;
    name: string;
    role: string;
    permissions: string[];
  } | null;
  organizations: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
}
