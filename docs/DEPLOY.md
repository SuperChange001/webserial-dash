# Deploying

The app is a static site (`pnpm build` → `dist/`). It needs no server-side code, but Web Serial only works on a **secure context**: `https://` or `http://localhost`. `file://` and plain `http://` on a LAN IP expose no `navigator.serial`.

## GitHub Pages via GitHub Actions

`.github/workflows/pages.yml` builds on every push to `main` (and on `workflow_dispatch`) and deploys with the OIDC-based `actions/deploy-pages`; no `gh-pages` branch is used.

What it does:

1. `pnpm/action-setup@v4` (reads `packageManager` from `package.json`) + Node 22 with pnpm cache.
2. `pnpm install --frozen-lockfile && pnpm build` with `BASE_PATH=/<repo>/` — `vite.config.ts` reads `BASE_PATH` (trailing slash required) for Vite's `base` and the PWA `start_url`/`scope`, because project pages live under `/<repo>/`.
3. `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (path `dist`) → `actions/deploy-pages@v4` in the `github-pages` environment. Concurrency group `pages`, in-flight deploys are not cancelled.

One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions** (not "Deploy from a branch"). Without this the deploy job fails with a 404 from the Pages API.
2. Push to `main`. The site appears at `https://<owner>.github.io/<repo>/`. Share dashboards with `?dashboard=<id>` and add `&demo` to auto-start the simulated device.
3. `pnpm build` runs `gen:schema` first, so `schema/dashboard.schema.json` is always current in the deployed tree. Exported dashboards carry `$schema: ../schema/dashboard.schema.json`, which resolves when the file is saved into `dashboards/`.

Deploying from a fork or a renamed repo needs no change: `BASE_PATH` is derived from `github.event.repository.name`.

### Custom domain

- Add the domain under **Settings → Pages → Custom domain** and create the DNS record GitHub shows (CNAME for subdomains, A/AAAA for apex).
- Commit `public/CNAME` containing the domain so Vite copies it into `dist/` on every build.
- Build with `BASE_PATH=/` (the site is now at the domain root): change the `BASE_PATH` env in `.github/workflows/pages.yml`.
- Enable **Enforce HTTPS** once the certificate is issued; Web Serial needs it.

## Progressive Web App

`vite-plugin-pwa` generates the manifest and a Workbox service worker (`registerType: 'autoUpdate'`, precaches js/css/html/svg/png/woff2 up to 4 MiB per file). Icons: `public/icons/icon-192.png`, `icon-512.png` (also used as maskable).

- Desktop Chrome/Edge: the install icon appears in the address bar.
- Android Chrome (148+ for USB serial, 138+ for Bluetooth RFCOMM ports): menu → **Install app** / **Add to Home screen**. Connect the board with a USB OTG adapter; Android asks for USB permission on first use. The installed app keeps the same permission model as the tab; previously granted ports are returned by `getPorts()`.
- Updates: the service worker refreshes assets in the background and activates on the next load. After deploying, reload twice (or close and reopen the installed app) to see the new version.
- Cached dashboards are built-ins only; imported dashboards live in `localStorage` per origin.

## Self-hosting

Any static file server works (nginx, Caddy, `python -m http.server`, S3 + CloudFront, Netlify, Cloudflare Pages):

```sh
pnpm install
BASE_PATH=/ pnpm build        # or /sub/path/ when not at the root
npx serve dist                # local check at http://localhost:3000 (localhost counts as secure)
```

Requirements and tips:

- Serve over HTTPS (Caddy does this automatically; for nginx use Let's Encrypt). On a LAN without a certificate, `http://localhost` still works on the machine itself; for other machines use a tunnel or `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with the origin listed.
- No rewrites are needed; the app is a single `index.html` and only uses query parameters (`?dashboard=`, `?demo`).
- Keep `sw.js` and `manifest.webmanifest` at the same base path as `index.html`; set `Cache-Control: no-cache` on `index.html` and `sw.js` so updates are picked up promptly, long cache on hashed `assets/*`.
- `pnpm preview` serves `dist/` locally on port 4173 (same server the e2e tests use).

## Pre-deploy checklist

- `pnpm check` passes.
- `pnpm build` succeeds with the intended `BASE_PATH` and `dist/index.html` references `/<base>/assets/...`.
- `https://<host>/<base>/?dashboard=demo-sensor&demo` shows moving widgets without hardware.
- Connect works with a real device on desktop Chrome and (if targeted) Android Chrome 148+.
