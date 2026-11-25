# Environment variables

Reference for `self_correcting_rag` runtime configuration. The
authoritative source is `backend/app/core/config.py` — this doc explains what each
group is for and which are required vs optional.

> Quick start: copy `backend/.env.example` to `backend/.env` and fill in the
> blanks marked **Required**. Defaults are sensible for local development.

## Project

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROJECT_NAME` | optional | `self_correcting_rag` | Used in logs, OpenAPI title, email templates |
| `DEBUG` | optional | `false` | When `true`, FastAPI returns full tracebacks. `.env.example` ships `true` for local work |
| `ENVIRONMENT` | optional | `local` | One of `development` / `local` / `staging` / `production` — it is a `Literal`, so other values fail validation |
| `TIMEZONE` | optional | `Asia/Shanghai` | IANA TZ name (e.g. `Europe/Warsaw`) |
| `FRONTEND_URL` | optional | `http://localhost:3010` | Declared in `config.py:100`, but no backend/frontend code reads it today (`grep -rn FRONTEND_URL` matches only the definition) |

## Auth & secrets

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | **required in prod** | (generated) | JWT signing key. Rotating invalidates all tokens |
| `ALLOW_REGISTRATION` | no | `true` | `false` closes self-registration; admins create accounts from the admin page. The first account can always register |
| `API_KEY` | **required in prod** | (generated) | Static admin/service-to-service key for `X-API-Key` header |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | optional | `30` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | optional | `10080` | JWT refresh token lifetime (7 days) |

## Database
| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_HOST` / `POSTGRES_PORT` | optional | `localhost` / `5432` | PostgreSQL location |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | set these | `postgres` / (empty) / `self_correcting_rag` | Credentials and database name |
| `DATABASE_URL` | — | (computed) | **Not configurable**: built from `POSTGRES_*` in `config.py:52` (`@computed_field`), so a value in `.env` is silently ignored (`extra="ignore"`) |
| `DB_POOL_SIZE` | optional | `5` | Number of long-lived connections |
| `DB_MAX_OVERFLOW` | optional | `10` | Burst capacity above pool size |
| `DB_POOL_TIMEOUT` | optional | `30` | Seconds to wait for a free connection |

## LLM / AI

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | optional | (empty) | From platform.openai.com. Not validated at startup — every LLM/embedding call just fails without it |
| `AI_DISABLE_THINKING` | optional | `false` | Send `enable_thinking=false` to providers that think by default (DashScope Qwen3); required there for `tool_choice=required` |
| `AI_MODEL` | optional | `gpt-5.5` | Default model used by agent (provider-specific) |

## RAG (qdrant)

| Variable | Required | Default | Description |
|---|---|---|---|
| `QDRANT_HOST` / `QDRANT_PORT` | optional | `localhost` / `6333` | Qdrant endpoint. There is no `QDRANT_URL` — the code only reads host/port (`config.py:144-145`) |
| `QDRANT_HTTPS` / `QDRANT_TIMEOUT_SECONDS` | optional | `false` / `30` | TLS flag and client timeout |
| `QDRANT_API_KEY` | optional | — | Auth (cloud Qdrant) |

## Frontend (`frontend/.env.local`)

Separate from the backend `.env` above — `frontend/README.md` has the full table.
The two that decide whether a deployment works at all:

| Variable | Read by | Description |
|---|---|---|
| `BACKEND_URL` | server | Backend origin for the Next.js BFF/route handlers (`frontend/next.config.ts:81`). It is a **frontend** var — the backend never reads it |
| `NEXT_PUBLIC_WS_URL` | browser | WebSocket origin for chat. Inlined at **build** time, so it needs a rebuild to change, and it must be an address the browser can reach — not a Docker service name |
| `COOKIE_SECURE` | server | `Secure` flag on the auth cookies. Unset follows `NODE_ENV`. A browser drops a `Secure` cookie served over plain `http://`, which makes every request after login return 401 — set `false` only for `http://` on a trusted network |

## Validation

```bash
# Confirm settings load without errors:
cd backend && uv run python -c "from app.core.config import settings; print(settings.model_dump_json(indent=2))"
```

No field in `config.py` is required — every one has a default, so a missing
variable never raises `pydantic_settings.SettingsError` at startup. Loading only
fails on these validators: `SECRET_KEY` shorter than 32 characters
(`config.py:85-92`), and in `ENVIRONMENT=production` a default `SECRET_KEY` or
`API_KEY`, or `"*"` in `CORS_ORIGINS` (`config.py:105-115`, `225-234`).

`backend/.env.example` is not exhaustive: `RESEARCH_*`, `REPORT_*`,
`RAG_RERANKER_*`, `SERVER_LLM_TURNS_*` exist in `config.py` but not there — trust `config.py`.
