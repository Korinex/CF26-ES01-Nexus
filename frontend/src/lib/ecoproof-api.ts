/**
 * EcoProof frontend transport boundary.
 * UI components depend on these HTTP contracts, not on SQLite, Express, or node internals.
 */
export type ApiOptions = RequestInit & { quiet?: boolean };

export const api = async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
  const { quiet: _quiet, ...request } = options;
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(request.headers || {}) },
    ...request,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
};

export const contracts = {
  stats: "/api/stats",
  organizations: "/api/organizations",
  evidence: "/api/evidence",
  conflicts: "/api/conflicts",
  networkStatus: "/api/network/status",
  activity: "/api/activity",
  catalog: "/api/catalog",
  networkProof: "/api/verify-network",
  judgeDemo: "/api/judge-demo",
  sync: "/api/network/sync",
  verifyNetwork: "/api/verify-network",
  benchmark: "/api/experiment/benchmark",
  killNode: "/api/network/kill",
  attest: (id: string) => `/api/organizations/${id}/attest`,
  evidenceAction: (id: string, action: string) => `/api/evidence/${id}/${action}`,
  versions: (id: string) => `/api/evidence/${id}/versions`,
  resolveConflict: (id: string) => `/api/conflicts/${id}/resolve`,
} as const;
