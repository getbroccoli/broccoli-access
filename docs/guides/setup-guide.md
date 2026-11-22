# Setup

Start Broccoli Access with `docker compose up` and open http://localhost:8080. The first browser to open it holds setup: it connects Google Workspace with your own Google app, following the steps the page shows, and registers the redirect address it shows for that app. The Google super admin who consents becomes the owner and is signed in. Any other browser sees that setup is in progress until the owner exists.

Set `SELF_HOSTED_PUBLIC_URL` (see `.env.example`) when Broccoli Access has a domain: only that origin may sign in, and an https address gives Secure session cookies.

The Chrome extension pairs only with an https address, because your Slack session travels to Broccoli Access through it. Plain http works only on the same computer (`localhost`, `127.0.0.1` or `[::1]`), such as `http://localhost:8080`.

# Rebuild

After pulling changes, run `docker compose up --build` to rebuild the image.

# Drop the database

To restart setup with an empty database, run:

```sh
docker compose down --volumes
docker compose up --build
```

# Email

Broccoli Access sends no email until you choose how in **Settings → Email**: your own mail server with an SMTP URL such as `smtps://user:password@smtp.example.com:465`, or a [Resend](https://resend.com) API key, each with the address emails come from. "Send me a test email" checks the choice. Set `SELF_HOSTED_PUBLIC_URL` so the links in emails use your domain.
