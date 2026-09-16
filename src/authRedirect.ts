/**
 * Keep OAuth and Google Drive consent returns on the page the user started from.
 * Supabase/Google return to this exact URL, so `/animate` stays `/animate` and
 * any shareable query/hash state is preserved.
 */
const AUTH_RETURN_KEY = "miniface.auth.return-url";

export function getAuthRedirectUrl(): string {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

export function rememberAuthReturnUrl(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTH_RETURN_KEY, getAuthRedirectUrl());
}

export function restoreAuthReturnUrl(): void {
  if (typeof window === "undefined") return;

  const savedUrl = window.sessionStorage.getItem(AUTH_RETURN_KEY);
  if (!savedUrl) return;

  window.sessionStorage.removeItem(AUTH_RETURN_KEY);
  const target = new URL(savedUrl, window.location.origin);
  if (target.origin !== window.location.origin) return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const savedPath = `${target.pathname}${target.search}${target.hash}`;
  if (current !== savedPath) {
    window.history.replaceState({}, "", savedPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

