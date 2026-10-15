# API versioning

The supported public API base path is `/api/v1`. For example:

- `GET /api/v1/contribuintes`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

Versioned requests use the same authentication, role authorization, tenant
scoping, and HTTPS requirements as the existing API.

The legacy `/api/...` paths remain available for existing clients and return a
`Deprecation: true` response header. New integrations should use `/api/v1/...`.
No removal date is set for the legacy paths. Unknown version prefixes, such as
`/api/v2/...`, return `404` until that version is implemented.

The web client uses `/api/v1` automatically through `apiFetch`; new direct
authentication requests should use `API_BASE_PATH` from
`src/services/api.ts`.
