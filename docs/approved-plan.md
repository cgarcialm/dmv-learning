# DMV Learning Agent Approved Plan

Last updated: 2026-05-26

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
- Live AI: mostly static content, AI for explain-more and free-form questions in learn mode, anchored to the current lesson but not hard-limited to it.
- Progress retention: keep all detailed attempt history indefinitely.
- Export: owner-only `/export`.
- Quiz controls: Telegram inline buttons only.

## Current Status

Done:

- Official DMV-only KB pilot and validation pipeline.
- Structured KB artifacts and review reports.
- Telegram bot MVP on Cloudflare Workers.
- Cloudflare KV setup and deployment wiring.
- Live Telegram webhook flow.
- Local simulator and preview tooling.
- Compact source labels and clickable source links.
- Learn mode with optional LLM-backed free-text help, anchored to the current lesson but allowed to answer broader adjacent DMV questions.
- User-facing test mode toggle with warning banner.
- Deterministic quiz/test scoring from the KB.

Not done:

- Full official handbook KB expansion.
- Stronger adaptive learning and spaced review.
- First-pass validation of practice, review, and test as distinct live flows.
- Public source evaluation.

## Re-Scoped Roadmap

1. **Learn-mode hardening**
   - Keep learn-mode AI grounded in the current lesson without blocking broader DMV questions.
   - Make fallback behavior predictable when the model is unavailable.
   - Keep `Quiz me` as the only transition into quiz mode.
   - Keep source labels compact and clickable.
   - Trim learn-message clutter only where it improves clarity.
   Exit when live `/learn` feels consistent and predictable.

2. **Practice first pass**
   - Validate `/practice` and `/practice_topic` in live use.
   - Confirm weak-topic selection and topic filtering.
   - Confirm answer explanations and progress updates behave correctly.
   - Make practice-specific UI clean enough for repeated use.
   Exit when practice behaves like adaptive drilling, not just another quiz entry point.

3. **Review first pass**
   - Validate `/review` in live use.
   - Confirm it uses weak-rule repetition and repeated-miss priority.
   - Confirm it draws from attempt history the way we expect.
   - Make review-specific UI concise and readable.
   Exit when review behaves like spaced repetition, not just another practice mode.

4. **Test first pass**
   - Validate `/test` in live use.
   - Confirm no explanations until the end.
   - Confirm pass/fail summary and missed-question review.
   - Make test-specific UI spare and exam-like.
   Exit when test mode feels like a real DMV simulation.

5. **Expand the full official KB**
   - Cover the remaining California Driver Handbook sections.
   - Keep official sample tests separate but included.
   - Generate complete rules, lessons, and questions from official sources.
   - Validate answer provenance and citations across the full KB.
   Exit when the full official KB is complete and passes validation.

6. **Build adaptive learning v2**
   - Add stronger weak-topic and weak-rule scheduling.
   - Turn repeated mistakes into a real review queue.
   - Improve `/practice`, `/review`, and `/stats` using the stored attempt history.
   Exit when the bot adapts study order from actual mistakes, not just basic weak-topic picking.

7. **Evaluate public sources one at a time**
   - Only after the official KB and adaptive loop are solid.
   - Review each source before adding it.
   - Use public sources only to improve coverage and wording, not as the source of truth.
   Exit when each approved source has a clear reason to exist.

UI and message formatting belong inside each feature step, not as a separate large redesign phase.

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

1. KB pipeline pilot. Done.
2. Review checkpoint. Done.
3. Telegram bot MVP. Done and live.
4. Learn-mode hardening. Next.
5. Practice first pass. Next after learn-mode.
6. Review first pass. Next after practice.
7. Test first pass. Next after review.
8. Full official KB expansion. Next after the first-pass flows.
9. Adaptive learning v2. After the full KB is in place.
10. Public source evaluation, one source at a time. Last.
