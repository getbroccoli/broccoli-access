# What to remove from the Broccoli copy (draft, 2026-11-20)

Not final: more may be added before the copy. Every removed table is listed in the [data model](../data-model.md).

## Remove

- Time off: the time off and bank holidays modules with their tables, the time off page, its settings and setup step.
- HR details: terms, working patterns and locations (tables, settings tabs, terms display), the `/me` profile page, HR fields on people.
- `employments`: a person has one manager, so the manager moves to a column on people.
- `company`: the name and logo come from Google; the brand lookup goes too.
- Managed mode: managed sign-in, the managed instance service and credential table, `MANAGED_` settings, the accounts relay.
- Passwords: the owner password, forgot and reset password, the password reset email. Sign-in is with Google only.
- AI: the AI integration (OpenRouter, Broccoli AI tokens, the sanitiser), the AI setup step and settings, AI file mapping, the external agent that maps files. CSV uploads come in a later circle, with a fixed format.
- The agent connection over MCP ("Connect your agent") with agent activity; a later circle copies it back.
- Processes and tasks, invites, permission profiles and `import_choices`; later circles copy them back when they need them.
- Slack: the Slack module and its connection; a later circle brings Slack back as a connector.
- Setup steps: company, import, import review, "Who uses Broccoli", ready. Connecting Google replaces them.
- Today page: Applications is the home page.
- Demo: the demo module, demo data and "Try with demo data". The product is tried on a real Google Workspace.
- The QA checklists of everything above; the setup guide is rewritten.

## Keep and change

- People: become the People page and a person's page, which show their app accounts.
- Settings: Connections and Email.
- Login: one "Sign in with Google" button.
- Record history, files, mail settings, and the architecture, code quality, testing and thesaurus docs.
