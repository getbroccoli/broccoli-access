<p align="center">
  <a href="https://getbroccoli.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
      <img src=".github/assets/logo.svg" alt="Broccoli Access" width="96">
    </picture>
  </a>
</p>

<h1 align="center">Broccoli Access</h1>

<p align="center">
  <strong>The open-source SaaS access management app.</strong><br>
  Request, approve and remove access to every tool your team uses. Self-host it.
</p>

<p align="center">
  <a href="https://getbroccoli.com">Website</a> ·
  <a href="docs/guides/setup-guide.md">Setup guide</a> ·
  <a href="docs/prd.md">Product requirements</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-AGPL--3.0-5E9072" alt="Licence: AGPL-3.0"></a>
  <a href="https://github.com/getbroccoli/broccoli-access/actions/workflows/ci.yml"><img src="https://github.com/getbroccoli/broccoli-access/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

> **Early.** Setup with Google Workspace, people, record history and email settings work today. Access management comes next.

## Quick install

```sh
curl -fsSLO https://raw.githubusercontent.com/getbroccoli/broccoli-access/main/docker-compose.yml
docker compose up
```

Open http://localhost:8080.

[Self-hosted setup guide](docs/guides/setup-guide.md)

## Run from source

Use `pnpm real` for hot reload with real Google and app connectors at
http://localhost:8081. Docker is required; cached images are reused. Set
`HOST_WEB_PORT` to choose another port. This mode keeps its own database and
secrets, separate from fake development and the installed Compose stack. Configure
email in Settings as with self-hosting.

Use `pnpm dev` for the fake Google and demo apps instead. Ctrl-C stops either mode
and keeps its data. Add `--drop-db` to reset only the selected mode's database.

## Licence

Copyright (C) 2026 Minari Limited.

Broccoli Access is open source under the [GNU Affero General Public License v3.0](LICENSE).
The Broccoli Access name and logo are covered by our [trademark policy](.github/TRADEMARK.md).

### Shared Google app

The published Compose file enables the Broccoli app through the development relay
at `https://integrations.dev.getbroccoli.com`. Set `GOOGLE_RELAY_URL` to use another
relay, or set it to an empty value to disable the Broccoli app and use your own
Google app. Google verification of the shared app is still pending. Its client secret stays on
the relay; tokens pass through it during consent and refresh, while directory
data goes directly from Google to your server. Protected setup remembers your
instance’s public address for shared Google sign-in; no extra URL setting is
required. Existing installations remember it when an admin changes the Google
app. Open setup through the intended public address. To move domains, set
`SELF_HOSTED_PUBLIC_URL` to the new address; it overrides the saved one. Settings → Google Workspace → Change
Google app switches either way without deleting people or apps.
