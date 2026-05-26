# Telegram Bot Design

Last updated: 2026-05-25

## Scope

The first runtime is a Telegram bot on Cloudflare Workers.

It uses the deterministic KB in `data/kb/` and stores learner state in Cloudflare KV.

## Runtime Assumptions

- Telegram webhook entrypoint in `src/worker.js`.
- One allowed Telegram user ID for v1.
- Cloudflare KV binding: `LEARNING_KV`.
- Daily reminder scheduled every 15 minutes in Workers cron, with local reminder logic at 8 PM America/Los_Angeles.

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`
- `TELEGRAM_WEBHOOK_SECRET` optional
- `TELEGRAM_WEBHOOK_PATH` optional

## Supported Commands

- `/start`
- `/learn`
- `/practice`
- `/practice_topic`
- `/review`
- `/test`
- `/stats`
- `/export`
- `/settings`
- `/sources`

## State Model

The bot stores:

- profile
- settings
- topic/rule progress
- all attempts
- active session

The current implementation keeps detailed attempts indefinitely so progress and metrics can be recomputed later.

## Notes

- Answers are inline buttons only.
- Lessons and questions come from the reviewed KB.
- The bot is conservative about scoring and only uses questions with valid answer source status.
