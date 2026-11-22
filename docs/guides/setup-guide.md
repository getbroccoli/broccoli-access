# Setup

Start Broccoli Access with `docker compose up` and open http://localhost:8080. The first browser to open it holds setup: it creates the owner account with an email and a password, and is signed in. Any other browser sees that setup is in progress until the owner exists.

Set `SELF_HOSTED_PUBLIC_URL` (see `.env.example`) when Broccoli Access has a domain: only that origin may sign in, and an https address gives Secure session cookies.

# Rebuild

After pulling changes, run `docker compose up --build` to rebuild the image.

# Drop the database

To restart setup with an empty database, run:

```sh
docker compose down --volumes
docker compose up --build
```

# Email

Broccoli Access sends no email until you choose how in **Settings → Email**: your own mail server with an SMTP URL such as `smtps://user:password@smtp.example.com:465`, or a [Resend](https://resend.com) API key, each with the address emails come from. "Send me a test email" checks the choice. While email is chosen, people with a password can reset a forgotten one from the sign-in page; set `SELF_HOSTED_PUBLIC_URL` so the links in emails use your domain.
