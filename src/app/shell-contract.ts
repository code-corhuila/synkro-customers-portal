// ADR-011 v1. Keep identical to synkro-front/src/shell/shell-contract.ts.
export interface ShellContract {
  contractVersion: 1;
  basePath: string;
  api: {
    request<T>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      options?: { query?: Record<string, string>; body?: unknown; idempotencyKey?: string; signal?: AbortSignal },
    ): Promise<T>;
  };
  session: { user(): { sub: string; role: 'ADMIN' | 'SALESPERSON' | 'INVENTORY' } | null };
  navigate(path: string): void;
}
