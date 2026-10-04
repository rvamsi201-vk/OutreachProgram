import { useAuth } from '../contexts/auth-context.js';
import type { Permission } from '@ai-crm/shared';

/**
 * <Can permission="campaigns.launch"> component hides UI
 * but the backend is the real enforcement.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();

  if (!user?.activeOrganization?.permissions.includes(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
