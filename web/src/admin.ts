// Admin token for Start/Reset (plan v3 9.3). Stored only in the demo laptop's browser.
const KEY = "atlasAdminToken";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: buttons stay hidden */
  }
}
