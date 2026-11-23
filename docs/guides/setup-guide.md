# Setup

Start Broccoli Access with `docker compose up -d --wait` and, once it returns, open http://localhost:8080, or the port `HOST_WEB_PORT` sets in `.env`. The first browser to open it holds setup: it connects Google Workspace with your own Google app, following the steps the page shows, and registers the redirect address it shows for that app. The Google super admin who consents becomes the owner and is signed in. Any other browser sees that setup is in progress until the owner exists.

Set `SELF_HOSTED_PUBLIC_URL` in a `.env` file beside `docker-compose.yml`, such as `SELF_HOSTED_PUBLIC_URL=https://access.example.com`, when Broccoli Access has a domain: only that origin may sign in, and an https address gives Secure session cookies.

# The Chrome extension

Connecting Slack needs the Broccoli Access extension in the owner's Chrome. Download it from your instance at its https address, in the first step of Connect Slack or in **Settings → Connections → Chrome extension**, and load it unpacked as the steps there say. A company-managed Chrome may block Developer mode, which loading it unpacked needs, or unknown extensions; then ask IT to allow Developer mode and the extension's ID, shown there too.

An unpacked extension doesn't update itself. After updating Broccoli Access, download it again from **Settings → Connections → Chrome extension**, unzip it over the same folder and press the extension's Reload in `chrome://extensions`, which keeps its pairing.

The extension pairs only with an https address, because your Slack session travels to Broccoli Access through it. Plain http works only on the same computer (`localhost`, `127.0.0.1` or `[::1]`), such as `http://localhost:8080`.

# Drop the database

To restart setup with an empty database, run:

```sh
docker compose down --volumes
docker compose up -d --wait
```

# Email

Broccoli Access sends no email until you choose how in **Settings → Email**: your own mail server with an SMTP URL such as `smtps://user:password@smtp.example.com:465`, or a [Resend](https://resend.com) API key, each with the address emails come from. "Send me a test email" checks the choice. Set `SELF_HOSTED_PUBLIC_URL` so the links in emails use your domain.
