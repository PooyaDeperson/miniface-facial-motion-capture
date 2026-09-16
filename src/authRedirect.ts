/**
 * Keep OAuth and Google Drive consent returns on the page the user started from.
 * Supabase/Google return to this exact URL, so `/animate` stays `/animate` and
 * any shareable query/hash state is preserved.
 */
export function getAuthRedirectUrl(): string {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

