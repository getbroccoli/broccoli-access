# broccoli-access

The open-source SaaS access management app. Request, approve and remove access to every tool your team uses. Self-host it.

**Status:** early. Broccoli Access starts as a copy of [Broccoli](https://github.com/getbroccoli/broccoli), the open-source Employee Operations System, cut down to its base: setup with an owner account, sign-in, people, record history and email settings. Access management comes next; see the [product requirements](docs/prd.md) and [circle 1](docs/circle1.md).

## Quick install

```sh
docker compose up
```

Open http://localhost:8080 and create the owner account. More in the [setup guide](docs/guides/setup-guide.md).

## Develop

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts this checkout's stack on free ports and prints its address, the address of Mailpit, which catches the email it sends, and the address of the [fake Google](docs/fake-apps.md) with the demo company Acme. `pnpm dev --drop-db` starts over with an empty database, and `pnpm dev:prune` removes the stacks of checkouts that no longer exist. Tests are in [testing](docs/testing.md).

## Licence

Copyright (C) 2026 Minari Limited.

Broccoli Access is open source under the [GNU Affero General Public License v3.0](LICENSE).
The Broccoli Access name and logo are covered by our [trademark policy](.github/TRADEMARK.md).
