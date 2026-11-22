# QA setup

How to get a development stack with a signed-in owner before a manual check. Use generated demo data only: the fake Google's demo company Acme, or `example.com` addresses.

## Start the stack

Run `pnpm dev` and set `URL` to the address it prints; it also prints the fake Google's address. Development data is kept between runs; an owner created once stays. `pnpm dev --drop-db` starts on a database without an owner.

## Hold setup

On a database without an owner, the first browser to open the app holds setup and lands on `/setup`; every other browser lands on `/setup/in-progress`. To free setup held by another browser, restart the dev stack with `pnpm dev --drop-db`.

From a terminal, keep the setup cookie in a cookie jar instead. The first start only gives the jar a token (`{"holder":"nobody"}`); the second claims setup with it (`{"holder":"you"}`):

```sh
curl -c cookies -b cookies -X POST -H "origin: $URL" "$URL/api/auth/setup/start"
curl -c cookies -b cookies -X POST -H "origin: $URL" "$URL/api/auth/setup/start"
```

## Connect Google Workspace

Setup's first step, `/setup`, connects the fake Google, which already knows this stack's redirect address. Enter the seed's client ID `123456789012-acme.apps.googleusercontent.com` and secret `acme-broccoli-access-fake-secret` (`packages/fake-apps/src/seed/acme.ts`), choose "Connect as Google admin", pick Mia Novak (`admin@acme.example`) on the fake's consent page and choose Allow. This signs Mia in as the owner and lands on the scan step (`/setup/scan`).

From a terminal, with the setup cookie from above, start the consent, answer the fake's consent form as Mia, and follow its redirect back with the same cookie jar:

```sh
AUTH=$(curl -s -c cookies -b cookies -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"clientId":"123456789012-acme.apps.googleusercontent.com","clientSecret":"acme-broccoli-access-fake-secret"}' \
  "$URL/api/google/connect" | node -pe 'JSON.parse(require("fs").readFileSync(0)).authorizationUrl')
CALLBACK=$(curl -s -o /dev/null -w '%{redirect_url}' "${AUTH%%\?*}" \
  --data "${AUTH#*\?}&account=admin%40acme.example&decision=allow")
curl -c cookies -b cookies "$CALLBACK"
```

A browser without the owner's session signs in again with "Sign in with Google" on `/login`, choosing Mia on the fake's consent page. After the scan, setup waits on Applications for the owner to select the company's apps; "Approve 6 and finish" finishes it and opens the app's other pages.

## Send email

`pnpm dev` runs Mailpit and configures a fresh instance to send through it from `access@example.com` before printing its address. Email works without visiting Settings. Saved email choices survive restarts; while Mailpit is chosen, links use the current development port. See [Email settings](email-settings.md).

## Add employees

With the session, call the `employees { create(input: …) }` mutation:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { employees { create(input: { firstName: \"Avery\", lastName: \"Abbott\", email: \"avery@example.com\" }) { employee { id } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } } }"}'
```
