# Using Roundtable from your phone (and sharing it with a few people)

Roundtable runs on your machine. To reach it from elsewhere, put it on a [Tailscale](https://tailscale.com) network: your devices (and anyone you invite) get a private URL, and nothing is exposed to the open internet.

Everyone who connects gets **their own workspace** — their own topics, buckets and profile. They do share your API keys, so the cost of their usage lands on your bill.

## 1. Point the app at your Tailscale identity

In `.env.local`:

```bash
PRIMARY_USER=you@example.com   # your Tailscale login
```

Requests that arrive without an identity (i.e. you, opening `localhost` on the machine itself) are treated as this user, so your laptop and phone show the same workspace. Find your login with `tailscale status --json | grep LoginName`.

## 2. Serve it on your tailnet

```bash
npm run dev                          # or: npm run build && npm start
tailscale serve --bg --http=80 3000
```

That prints your private URL, e.g. `http://your-machine.tailnet-name.ts.net/`. Open it on your phone with Tailscale running. Traffic is encrypted by Tailscale itself.

Prefer `https://`? Enable **HTTPS Certificates** in the [DNS page of the admin console](https://login.tailscale.com/admin/dns), then use `tailscale serve --bg 3000` instead.

To stop sharing: `tailscale serve --http=80 off`.

## 3. Invite someone

1. In the [admin console](https://login.tailscale.com/admin/machines), find your machine, open its **⋯** menu and choose **Share…**.
2. Send the invite link. They install Tailscale, sign in with their own account and accept.
3. They open the same URL. Tailscale tells the app who they are, and they land in an empty workspace of their own.

To revoke access, remove the share in the admin console.

## How the security works

- **Identity comes from Tailscale**, not from a password. `tailscale serve` adds a `Tailscale-User-Login` header, which the app reads in [`lib/user.ts`](lib/user.ts) to pick the workspace.
- **The app binds to `127.0.0.1`** (see the `dev`/`start` scripts), so only the Tailscale proxy can reach it. This matters: if the app listened on your LAN, anyone on your Wi-Fi could send a forged identity header and open someone else's workspace. Don't change the bind address.
- **Never use `tailscale funnel`** for this app. Funnel publishes to the whole internet *and* strips identity headers, so every visitor would land in the primary user's workspace.

## Always-on instead?

This setup needs your machine awake. For a laptop-independent deployment, run it on a small VM with a persistent disk for `data/mediation.db` and put the same Tailscale identity check in front of it, or swap in another authenticating proxy that can supply a trusted identity header.
