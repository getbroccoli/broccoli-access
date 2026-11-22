# QA: Email settings

A manual check of how the instance sends email against a development stack.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example` and move setup on as in [QA setup](setup.md). `pnpm dev` also prints the Mailpit address, where the email it sends arrives.

## Settings page

- [ ] "Email" under System in the settings menu opens `/settings/email`, with the saved mail choice selected.
- [ ] "Your mail server (SMTP)" shows the SMTP URL and From address fields; "Resend" shows the API key and From address fields; "No email" shows none.
- [ ] Under `pnpm dev`, a fresh instance opens with SMTP selected, `access@example.com`, and its URL shown as "Saved" with Replace. "Send me a test email" is available immediately, without saving first.
- [ ] After Replace, entering `smtp://mailpit:1025` and choosing "Check and save" shows "Checking…", then "Email settings saved"; the URL field becomes "Saved" with Replace.
- [ ] A reload keeps the choice and From, and never shows the URL.
- [ ] `smtp://nowhere.invalid:25` shows "Your mail server could not be reached…"; `https://smtp.example.com` shows "Enter a URL that starts with smtp:// or smtps://."; a From without `@` shows "Enter an email address…". Each time the earlier choice stays.
- [ ] Switching from a saved SMTP server to Resend asks for the API key: saving without one shows "Enter your Resend API key."
- [ ] After Replace, typing an SMTP URL and then choosing Resend shows an empty API key field; choosing SMTP again shows "Saved".
- [ ] An SMTP URL with a query, such as `smtp://mailpit:1025?pool=true`, shows "Enter a URL that starts with smtp:// or smtps://."
- [ ] "Send me a test email" shows "Test email sent to admin@acme.example", and Mailpit receives "Broccoli Access can send email" from "Broccoli Access" <access@example.com>.
- [ ] With Resend and a made-up key, "Send me a test email" shows "The test email was not sent:" with Resend's reason.
- [ ] Saving "No email" hides "Send me a test email".
- [ ] Restarting `pnpm dev` keeps a saved "No email", Resend or custom SMTP choice. With Mailpit chosen, links in new emails use the new development port.
