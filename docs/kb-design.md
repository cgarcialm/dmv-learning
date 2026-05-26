# Knowledge Base Design

## Goal

Create a reviewed, structured, source-cited KB that can drive lessons, practice, review, test mode, stats, and future dashboard metrics.

The first artifact is an official-only pilot generated from California DMV sources.

## Artifact Files

Generated files live under `data/kb/`:

- `manifest.json` - KB version, generation metadata, artifact list.
- `sources.json` - official source pages, URLs, retrieval timestamps, content hashes.
- `topics.json` - topic taxonomy.
- `rules.json` - atomic rule cards used for mastery tracking.
- `lessons.json` - short teach-before-quiz modules grouped by topic.
- `questions.json` - DMV-style multiple-choice questions.
- `official_sample_questions.json` - parsed official DMV sample questions with all visible answer choices preserved.
- `test_profiles.json` - DMV-style test configuration.

Reports live under `data/reports/`:

- `kb_review.md` - human-readable review report.
- `validation_summary.md` - schema/reference/coverage checks.

Raw source snapshots live under `data/sources/raw/`.

## Provenance

Every lesson segment, rule, question, answer explanation, and test profile must reference one or more `source_id` values.

Telegram should show:

- A compact source label in the message.
- A Sources button with detailed source title and URL.

## Core Schemas

### Source

```json
{
  "source_id": "ca-dmv-handbook-section-6-navigating-roads",
  "title": "California Driver Handbook - Section 6: Navigating the Roads",
  "url": "https://www.dmv.ca.gov/...",
  "source_type": "official_handbook_section",
  "official": true,
  "retrieved_at": "2026-05-25T00:00:00.000Z",
  "content_sha256": "...",
  "citation_label": "CA Driver Handbook, Section 6"
}
```

### Rule

```json
{
  "rule_id": "right_of_way_pedestrians_crosswalks",
  "topic_ids": ["right_of_way"],
  "title": "Yield to pedestrians in crosswalks",
  "rule_summary": "Drivers must yield when pedestrians are crossing in marked or unmarked crosswalks.",
  "source_ids": ["ca-dmv-handbook-section-7-laws-road"],
  "confidence": "high",
  "review_status": "draft"
}
```

### Question

```json
{
  "question_id": "q_right_of_way_001",
  "topic_ids": ["right_of_way"],
  "rule_ids": ["right_of_way_left_turn_oncoming"],
  "prompt": "When turning left at an intersection, what should you do if an approaching vehicle is close enough to be dangerous?",
  "choices": [
    { "choice_id": "a", "text": "Turn before the vehicle reaches the intersection." },
    { "choice_id": "b", "text": "Yield until it is safe to complete the turn." },
    { "choice_id": "c", "text": "Enter the intersection and stop in the oncoming lane." }
  ],
  "correct_choice_id": "b",
  "explanation": "Yield to approaching traffic that is close enough to create a hazard before completing a left turn.",
  "source_ids": ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-2"],
  "difficulty": "medium",
  "confidence": "high",
  "answer_source_status": "handbook_verified",
  "answer_source_detail": "Correct answer verified from the cited handbook rule.",
  "review_status": "draft"
}
```

### Official Sample Question

This artifact preserves official DMV sample-test prompts and all visible choices exactly enough for traceability. It is separate from `questions.json` because the official sample pages do not currently expose a clean answer-key artifact in the captured text.

```json
{
  "sample_question_id": "ca_dmv_sample_test_1_q01",
  "source_id": "ca-dmv-sample-test-1",
  "source_question_number": 1,
  "prompt": "When is it legal to drive off the road to pass another vehicle?",
  "choices": [
    { "choice_id": "a", "text": "If the vehicle ahead is turning left." },
    { "choice_id": "b", "text": "It is not legal under any conditions." },
    { "choice_id": "c", "text": "If there are two or more one-way lanes." }
  ],
  "correct_choice_id": "b",
  "answer_source_status": "official_answer_key",
  "answer_source_detail": "Correct answer parsed from the official DMV result page after submitting the sample test online.",
  "linked_question_ids": []
}
```

Answer status values:

- `official_answer_key` - the official source directly exposed the correct answer, including official DMV result pages after online sample-test submission.
- `handbook_verified` - the answer was verified against handbook material.
- `not_exposed_in_source_snapshot` - prompt and choices are official, but no official answer key was captured.
- `needs_review` - the item needs review before use as a scored question.

## Validation Rules

The KB validator checks:

- All JSON files parse.
- Required IDs exist and are unique.
- Referenced sources, topics, rules, and questions exist.
- Every rule, lesson, question, and test profile cites at least one source.
- Every question is multiple choice and has exactly one valid correct answer.
- Every official sample question has all visible choices preserved.
- Every question has topic and rule tags.
- Every pilot topic has at least one rule, lesson, and question.
- Official-only pilot sources are marked `official: true`.

## Storage Implications

Learner state should keep raw attempts indefinitely. Aggregates can be recomputed.

Suggested KV keys:

- `user:{telegram_id}:profile`
- `user:{telegram_id}:settings`
- `user:{telegram_id}:progress`
- `user:{telegram_id}:active_session`
- `user:{telegram_id}:attempts:{yyyy-mm}`
- `user:{telegram_id}:sessions:{yyyy-mm}`
- `user:{telegram_id}:review_queue`
- `user:{telegram_id}:test_runs`

## Generation Policy

The current KB pipeline is deterministic and repo-authored. It fetches official DMV sources, preserves official sample questions, promotes verified questions, and validates the resulting JSON artifacts.

No external LLM API is required for KB generation.
