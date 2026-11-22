# Thesaurus

The words Broccoli Access's code and docs use, and what each one means. Only Broccoli Access's own terms belong here; well-known ones such as job, model or mapping do not.

- **Instance**: one installation of Broccoli Access with its own database, for one company. The `instance` table holds its single row.
- **Owner**: the user who set up the instance. Identified by the user id, never by the email.
- **User**: a person who can sign in (Better Auth's `user` table).
- **Permission profile**: a named set of what a user may do. Everyone has `EMPLOYEE`, and the owner has `OWNER`, which holds the grants of `ADMIN`. Not "role", which sounds like a job, nor "access level".
- **Built-in**: defined in Broccoli Access's code and changed by its releases, such as the built-in permission profiles. Not "system", which means Broccoli Access acting on its own.
- **Account**: one way a user signs in, such as their Google account (`google`) (Better Auth's `account` table).
- **Session**: a signed-in browser, carried in a cookie and stored in the `session` table.
- **Setup**: the first-run flow of a new instance: the setup holder connects Google Workspace with their own Google app, and the Google super admin who consents becomes the owner, signed in; then the workspace is scanned and the owner selects the company's apps.
- **Setup step**: where a new instance is in setup: `connect_google`, `scan`, `select_apps`, then `done`.
- **Redirect address**: `<public origin>/api/google/callback`, where Google sends the admin back after consent. The admin registers it for their Google app; every Google consent and sign-in comes back through it.
- **Setup session**: before the owner exists, the server-side record that one browser holds setup: the hash of a token in the `broccoli_access_setup` cookie, stored by the first start that carries a token, and valid three days after the holder last opened setup. Setup stays locked to it, even after it expires, until the database is dropped.
- **Setup holder**: the browser holding the setup session, and the security context it acts as. It may connect Google Workspace, which creates the owner, and nothing else.
- **Data folder**: `DATA_DIR`, the folder for files that must survive restarts, such as `secrets/`.
- **File**: bytes with a MIME type that a module stores in the `files` table, such as an employee's avatar. The module that references it decides who may see it.
- **Record**: a module's main entity, such as an employee.
- **Today**: the home page, where a person lands after setup and after signing in. It shows what needs them today; for now, nothing.
- **Subject**: the employee a record is about, which permission scopes are measured against.
- **History**: every change to a record, kept as history lines in the `record_history` table and shown on the record. The product word; "audit" stays internal and means a separate security trail.
- **History line**: one change to one record: its change author, when, its change cause, its change reason and each changed field's old and new value. Appended in the transaction of the change, and never deleted.
- **Change author**: who made a change to a record, from the security context: a signed-in user, Broccoli Access itself or the setup holder.
- **Change cause**: why a change to a record happened or what started it, such as `EDITED_DIRECTLY`, with the id of what caused it when there is one. The module whose action is the cause declares it.
- **Change reason**: why, in the change author's own words: `changeReason` on an input, the reason on its history line.
- **Employee**: someone who works for the company. The People area lists employees.
- **Security context**: who is calling application code: a signed-in user, and whether they are the owner; the setup holder; or the system.
- **System**: Broccoli Access acting on its own, such as creating the owner at setup.
- **Domain event**: something that happened in the domain, published by one module in a transaction and handled by others after the commit, such as `records.changed`.
- **Mail choice**: how the instance sends email: the owner's SMTP server, their Resend key, or no email. Saved on the instance in Settings.
