# Google's discovery documents

Copies of Google's published API descriptions. The fake reads its scopes and page sizes from
them, and the tests check every fake response against them. Each was fetched on 21 Nov 2026
and formatted with Prettier, unchanged otherwise.

- `directoryV1.json`: `https://admin.googleapis.com/$discovery/rest?version=directory_v1`, revision `20261117`.
- `reportsV1.json`: `https://admin.googleapis.com/$discovery/rest?version=reports_v1`, revision `20261117`.
- `openidConfiguration.json`: `https://accounts.google.com/.well-known/openid-configuration`.

To refresh one, fetch it again, format it, update its date here and run the tests.
