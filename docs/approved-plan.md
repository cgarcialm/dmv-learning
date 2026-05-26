# DMV Learning Agent Approved Plan

Last updated: 2026-05-25

## Product Direction

Build a Telegram-first California DMV Class C learning agent. The product should be phone-first, low friction, reminder-driven, and focused on teaching before quizzing.

The v1 app should use a reviewed structured knowledge base for core lessons and quiz answers. AI is used selectively for explain-more flows, free-form questions, and weak-area summaries.

## Locked Decisions

- First surface: Telegram bot.
- Hosting: small cloud deployment from the start.
- Runtime: Cloudflare Workers.
- Storage: Cloudflare KV only for v1 learner state.
- User scope: single allowed Telegram user ID.
- Test target: California regular Class C driver license / permit knowledge test.
- Daily flow: teach, quick quiz, review mistakes.
- Daily session length: 8-10 minutes.
- Reminder: one daily reminder at 8 PM America/Los_Angeles.
- On-demand study: unlimited `/learn`, `/practice`, `/review`, and `/test`.
- Bot tone: concise coach.
- Citations: every lesson, explanation, correction, and answer cites sources.
- Citation UX: compact citation label plus a Sources button.
- Live AI: mostly static content, AI for explain-more, free-form questions, and weak-area summaries.
- Progress retention: keep all detailed attempt history indefinitely.
- Export: owner-only `/export`.
- Quiz controls: Telegram inline buttons only.

## Commands

V1 commands:

- `/start` - onboarding and access check.
- `/learn` - daily-style teach, quiz, review session.
- `/practice` - adaptive practice.
- `/practice_topic` - choose a topic.
- `/review` - spaced repetition review.
- `/test` - full DMV-style simulation.
- `/stats` - progress and weak areas.
- `/export` - owner data export.
- `/settings` - reminder time and preferences.
- `/sources` - KB/source info.

## Knowledge Base Policy

Start with official DMV material only:

- California Driver Handbook.
- Official California DMV sample Class C knowledge tests.

Public quiz/question sources are deferred. Each public source must be proposed and approved before use.

The first KB is a small pilot. Once the structure is approved, expand to the full official handbook.

Pilot topics:

- Right-of-way.
- Signs/signals.
- Speed limits.
- Lane changes/turns.
- Parking/stopping.

## KB Review Workflow

Use light review:

- Official-derived content is usable with provenance.
- Low-confidence or incomplete items are flagged.
- The generator produces structured JSON, a Markdown review report, and a validation summary.

## Implementation Phases

1. KB pipeline pilot.
2. Review checkpoint.
3. Telegram bot MVP.
4. Adaptive learning.
5. Cloud deployment.
6. Full official KB.
7. Public source evaluation, one source at a time.

