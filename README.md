# broccoli-access

The open-source SaaS access management app. Request, approve and remove access to every tool your team uses. Self-host it.

**Status:** early. Broccoli Access starts as a copy of [Broccoli](https://github.com/getbroccoli/broccoli), the open-source Employee Operations System, cut down to its base: setup by connecting Google Workspace, people, record history and email settings. Access management comes next; see the [product requirements](docs/prd.md) and [circle 1](docs/circle1.md).

## Install

In an empty folder, download [`docker-compose.yml`](docker-compose.yml) and start it:

```sh
curl -fsSLO https://raw.githubusercontent.com/getbroccoli/broccoli-access/main/docker-compose.yml
docker compose up -d --wait
```

Once it returns, open http://localhost:8080 and connect Google Workspace. More in the [setup guide](docs/guides/setup-guide.md).

It runs two images from GitHub's container registry: `ghcr.io/getbroccoli/broccoli-access` and the connectors, `ghcr.io/getbroccoli/broccoli-access-connectors`. When a merge to `main` of either repository passes CI, its CI publishes its image for `linux/amd64` only, tagged `latest` and `sha-<7-character commit>`.

- **Update:** `docker compose pull && docker compose up -d --wait`.
- **Pin a version:** in `docker-compose.yml`, replace `latest` in both `image:` lines, each with a `sha-` tag from its own [package page](https://github.com/orgs/getbroccoli/packages), such as `ghcr.io/getbroccoli/broccoli-access:sha-1a2b3c4`.

## Develop

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts this checkout's stack on free ports and prints its address, the address of Mailpit, which catches the email it sends, and the address of the [fake Google](docs/fake-apps.md) with the demo company Acme. `pnpm dev --drop-db` starts over with an empty database, and `pnpm dev:prune` removes the stacks of checkouts that no longer exist. Tests are in [testing](docs/testing.md).

`docker compose up --build -d --wait` runs the self-hosted stack with the Broccoli Access image built from this checkout instead of the published one.

## Licence

Copyright (C) 2026 Minari Limited.

Broccoli Access is open source under the [GNU Affero General Public License v3.0](LICENSE).
The Broccoli Access name and logo are covered by our [trademark policy](.github/TRADEMARK.md).
