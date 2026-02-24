const WORKSPACE_SESSION_KEY = "ANDEXA_WORKSPACE_SESSION_ID";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getWorkspaceSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(WORKSPACE_SESSION_KEY);
  return value && value.trim().length > 0 ? value : null;
}

export function getOrCreateWorkspaceSessionId(): string {
  const existing = getWorkspaceSessionId();
  if (existing) return existing;
  const created = createSessionId();
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(WORKSPACE_SESSION_KEY, created);
  }
  return created;
}

export function resetWorkspaceSessionId(): string {
  const created = createSessionId();
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(WORKSPACE_SESSION_KEY, created);
  }
  return created;
}
