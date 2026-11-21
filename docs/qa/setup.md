# QA setup

How to get a development stack with a signed-in owner before a manual check. Use generated demo data only, with `example.com` addresses.

## Start the stack

Run `pnpm dev` and set `URL` to the address it prints. Development data is kept between runs; an owner created once stays. `pnpm dev --drop-db` starts on a database without an owner.

## Hold setup

On a database without an owner, the first browser to open the app holds setup and lands on `/setup`; every other browser lands on `/setup/in-progress`. To free setup held by another browser, restart the dev stack with `pnpm dev --drop-db`.

From a terminal, keep the setup cookie in a cookie jar instead:

```sh
curl -c cookies -b cookies -X POST -H "origin: $URL" "$URL/api/auth/setup/start"
```

## Create the owner

Setup's only step, `/setup`, creates the owner. Enter `owner@example.com` and a password of at least 8 characters, then choose "Create account". This signs you in and ends on Today (`/`).

From a terminal:

```sh
curl -c cookies -b cookies -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"owner@example.com","password":"correct-horse-battery"}' "$URL/api/auth/setup"
```

## Sign in again

Once the owner exists, setup answers `OWNER_EXISTS`. Sign in with the same body at `/api/auth/sign-in/email`, from the console or with `curl -c cookies`.

## Send email

`pnpm dev` runs Mailpit and configures a fresh instance to send through it from `access@example.com` before printing its address. Email works without visiting Settings. Saved email choices survive restarts; while Mailpit is chosen, links use the current development port. See [Email settings and password reset](email-settings.md).

## Add employees

With the session, call the `employees { create(input: …) }` mutation:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { employees { create(input: { firstName: \"Avery\", lastName: \"Abbott\", email: \"avery@example.com\" }) { employee { id } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } } }"}'
```
