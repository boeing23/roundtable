/**
 * Who is making this request.
 *
 * Behind `tailscale serve`, Tailscale injects the caller's identity as
 * `Tailscale-User-Login` (tailnet traffic only; Funnel strips it). Locally
 * there is no header, so requests fall back to PRIMARY_USER — set that to your
 * own Tailscale login so your laptop and your phone see the same workspace.
 *
 * SECURITY: the header is only trustworthy if nothing but the Tailscale proxy
 * can reach the app. Bind the server to 127.0.0.1 (the npm scripts do) so
 * nobody on your LAN can send a forged header.
 */
export const DEFAULT_OWNER = (process.env.PRIMARY_USER ?? "local").trim().toLowerCase();

export function currentUser(req: Request): string {
  const header = req.headers.get("tailscale-user-login");
  return header?.trim().toLowerCase() || DEFAULT_OWNER;
}
