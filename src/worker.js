import questions from "../data/kb/questions.json" with { type: "json" };
import lessons from "../data/kb/lessons.json" with { type: "json" };
import topics from "../data/kb/topics.json" with { type: "json" };
import sources from "../data/kb/sources.json" with { type: "json" };
import officialSampleQuestions from "../data/kb/official_sample_questions.json" with { type: "json" };
import {
  applyTestModeCommand,
  compactSourceLabel,
  defaultSettings,
  defaultState,
  getLearningLlmConfig,
  persistState,
  prefixTestModeWarning,
  truncateChoiceText
} from "./bot-helpers.js";

const memoryStore = new Map();
const webhookSecretPath = "telegram-webhook";

const sourceById = Object.fromEntries(
  sources.map((source) => [source.source_id, source])
);

const topicById = Object.fromEntries(
  topics.map((topic) => [topic.topic_id, topic])
);

const questionsById = Object.fromEntries(
  questions.map((question) => [question.question_id, question])
);

const questionsByTopic = groupByTopic(questions);
const lessonsByTopic = groupLessonsByTopic(lessons);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      return new Response("dmv-learning bot ok", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (env.TELEGRAM_WEBHOOK_PATH && !url.pathname.endsWith(`/${env.TELEGRAM_WEBHOOK_PATH}`)) {
      return new Response("Not found", { status: 404 });
    }

    const update = await request.json();
    const userId = extractUserId(update);
    if (!userId) {
      return new Response("ok");
    }

    if (!isAllowedUser(env, userId)) {
      return new Response("ok");
    }

    const state = await loadState(env, userId);
    await handleUpdate(update, state, env);
    await saveState(env, userId, persistState(env, state));

    return new Response("ok");
  },

  async scheduled(controller, env, ctx) {
    const allowedUserId = env.TELEGRAM_ALLOWED_USER_ID;
    if (!allowedUserId) return;

    const state = await loadState(env, allowedUserId);
    const settings = state.settings ?? defaultSettings();
    if (settings.test_mode) return;
    const localTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(controller.scheduledTime));

    const [weekday, datePart, timePart] = localTime.split(", ").length === 3
      ? localTime.split(", ")
      : [null, null, localTime];
    const [hour] = timePart.split(":").map((part) => Number(part));
    const today = `${datePart ?? timePart}`;
    const shouldSend = settings.daily_reminder_enabled !== false && hour === settings.reminder_hour_local && state.progress.last_reminder_day !== today;
    if (!shouldSend) return;

    state.progress.last_reminder_day = today;
    state.progress.last_reminder_at = new Date(controller.scheduledTime).toISOString();
    if (shouldPersistState(env)) {
      await saveState(env, allowedUserId, state);
    }

    ctx.waitUntil(sendTelegramMessage(env, {
      chat_id: allowedUserId,
      text: buildReminderText(state)
    }));
  }
};

async function handleUpdate(update, state, env) {
  if (update.message) {
    const message = update.message;
    const text = (message.text ?? "").trim();
    const chatId = message.chat?.id;
    if (!chatId || !text) return;

    if (text.startsWith("/start")) {
      state.profile.started_at ??= new Date().toISOString();
      state.profile.telegram_user_id = String(message.from?.id ?? "");
      state.profile.chat_id = String(chatId);
      state.progress.last_activity_at = new Date().toISOString();
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, [
          "DMV learning bot is ready.",
          "Use /learn, /practice, /review, /test, /stats, /export, /sources, /settings.",
          "Reply buttons are used for answers."
        ].join("\n")),
        reply_markup: mainMenuKeyboard()
      });
      return;
    }

    if (text.startsWith("/learn")) {
      startSession(state, "learn");
      await sendLessonAndLearnPrompt(env, chatId, state);
      return;
    }

    if (text.startsWith("/quiz")) {
      await startQuizFromLearn(env, chatId, state);
      return;
    }

    if (text.startsWith("/testmode")) {
      applyTestModeCommand(state, text);
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, state.settings.test_mode
          ? "Test mode is on. Progress will not be saved."
          : "Test mode is off. Progress will be saved."),
        reply_markup: settingsKeyboard(state)
      });
      return;
    }

    if (text.startsWith("/practice_topic")) {
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, "Choose a topic."),
        reply_markup: topicKeyboard()
      });
      return;
    }

    if (text.startsWith("/practice")) {
      const topicId = chooseWeakTopic(state) ?? "right_of_way";
      startSession(state, "practice", topicId);
      await sendLessonAndFirstQuestion(env, chatId, state);
      return;
    }

    if (text.startsWith("/review")) {
      const topicId = chooseWeakTopic(state) ?? "right_of_way";
      startSession(state, "review", topicId);
      await sendLessonAndFirstQuestion(env, chatId, state);
      return;
    }

    if (text.startsWith("/test")) {
      startSession(state, "test");
      await sendLessonAndFirstQuestion(env, chatId, state, true);
      return;
    }

    if (text.startsWith("/stats")) {
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, renderStats(state))
      });
      return;
    }

    if (text.startsWith("/sources")) {
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, renderSourcesSummary())
      });
      return;
    }

    if (text.startsWith("/settings")) {
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, renderSettings(state)),
        reply_markup: settingsKeyboard(state)
      });
      return;
    }

    if (state.active_session?.mode === "learn" && (!state.active_session.quiz_started || state.active_session.awaiting_next)) {
      await handleLearningMessage(env, chatId, state, text);
      return;
    }

    if (text.startsWith("/export")) {
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json"
      });
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("document", blob, "dmv-learning-export.json");
      form.append("caption", "Progress export");
      await sendTelegramForm(env, "sendDocument", form);
      return;
    }

    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: prefixTestModeWarning(state, "Use /learn, /practice, /review, /test, /stats, /sources, /settings.")
    });
    return;
  }

  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message?.chat?.id;
    const userId = String(query.from?.id ?? "");
    const data = String(query.data ?? "");
    if (!chatId || !userId) return;

    if (!isAllowedUser(env, userId)) return;

    await answerCallback(env, query.id, "");

    if (data.startsWith("cmd:")) {
      const action = data.slice(4);
      if (action === "learn") {
        startSession(state, "learn");
        await sendLessonAndLearnPrompt(env, chatId, state);
      } else if (action === "quiz") {
        await startQuizFromLearn(env, chatId, state);
      } else if (action === "practice") {
        startSession(state, "practice", chooseWeakTopic(state) ?? "right_of_way");
        await sendLessonAndFirstQuestion(env, chatId, state);
      } else if (action === "review") {
        startSession(state, "review", chooseWeakTopic(state) ?? "right_of_way");
        await sendLessonAndFirstQuestion(env, chatId, state);
      } else if (action === "test") {
        startSession(state, "test");
        await sendLessonAndFirstQuestion(env, chatId, state, true);
      } else if (action === "sources") {
        await sendTelegramMessage(env, { chat_id: chatId, text: prefixTestModeWarning(state, renderSourcesSummary()) });
      } else if (action === "stats") {
        await sendTelegramMessage(env, { chat_id: chatId, text: prefixTestModeWarning(state, renderStats(state)) });
      } else if (action === "settings") {
        await sendTelegramMessage(env, { chat_id: chatId, text: prefixTestModeWarning(state, renderSettings(state)), reply_markup: settingsKeyboard(state) });
      }
      return;
    }

    if (data.startsWith("topic:")) {
      const topicId = data.slice(6);
      startSession(state, "practice", topicId);
      await sendLessonAndFirstQuestion(env, chatId, state);
      return;
    }

    if (data === "learn:quiz") {
      await startQuizFromLearn(env, chatId, state);
      return;
    }

    if (data.startsWith("setting:")) {
      const minute = Number(data.slice(8));
      state.settings.reminder_hour_local = minute;
      state.settings.daily_reminder_enabled = minute > 0;
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, minute > 0
          ? `Reminder time updated to ${minute}:00 America/Los_Angeles.`
          : "Daily reminder disabled.")
      });
      return;
    }

    if (data.startsWith("mode:test:")) {
      const mode = data.slice(10);
      state.settings.test_mode = mode === "on";
      state.active_session = null;
      await sendTelegramMessage(env, {
        chat_id: chatId,
        text: prefixTestModeWarning(state, state.settings.test_mode
          ? "Test mode is on. Progress will not be saved."
          : "Test mode is off. Progress will be saved."),
        reply_markup: settingsKeyboard(state)
      });
      return;
    }

    if (data.startsWith("ans:")) {
      const [, sessionId, choiceId] = data.split(":");
      await handleAnswer(env, state, chatId, sessionId, choiceId);
      return;
    }

    if (data.startsWith("next:")) {
      const sessionId = data.slice(5);
      await handleNext(env, state, chatId, sessionId);
      return;
    }
  }
}

async function handleAnswer(env, state, chatId, sessionId, choiceId) {
  const session = state.active_session;
  if (!session || session.session_id !== sessionId) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: "That session is no longer active. Start a new one with /learn, /practice, /review, or /test."
    });
    return;
  }

  if (session.awaiting_next) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: prefixTestModeWarning(state, "Tap Next to continue.")
    });
    return;
  }

  const questionId = session.question_ids[session.current_index];
  const question = questionsById[questionId];
  if (!question) return;

  const isCorrect = question.correct_choice_id === choiceId;
  const selectedChoice = question.choices.find((choice) => choice.choice_id === choiceId);
  const correctChoice = question.choices.find((choice) => choice.choice_id === question.correct_choice_id);

  recordAttempt(state, session, question, choiceId, isCorrect);
  session.awaiting_next = true;
  state.progress.last_activity_at = new Date().toISOString();

  await sendTelegramMessage(env, {
    chat_id: chatId,
    html: true,
    text: prefixTestModeWarning(state, [
      isCorrect ? "Correct." : "Incorrect.",
      `Your answer: ${escapeHtml(selectedChoice?.text ?? choiceId)}`,
      `Correct answer: ${escapeHtml(correctChoice?.text ?? "")}`,
      renderSourceLinksHtml(question.source_ids),
      question.explanation ? `Why: ${escapeHtml(question.explanation)}` : null
    ].filter(Boolean).join("\n")),
    reply_markup: nextKeyboard(session.session_id)
  });
}

async function startQuizFromLearn(env, chatId, state) {
  const session = state.active_session;
  if (!session || session.mode !== "learn") {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: prefixTestModeWarning(state, "Start /learn first, then tap Quiz me or send /quiz.")
    });
    return;
  }

  session.quiz_started = true;
  await sendTelegramMessage(env, {
    chat_id: chatId,
    text: prefixTestModeWarning(state, "Quiz mode started. Answer the questions below."),
    reply_markup: mainMenuKeyboard()
  });
  await sendQuestion(env, chatId, state, session);
}

async function handleNext(env, state, chatId, sessionId) {
  const session = state.active_session;
  if (!session || session.session_id !== sessionId) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: "That session is no longer active. Start a new one with /learn, /practice, /review, or /test."
    });
    return;
  }

  if (!session.awaiting_next) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: prefixTestModeWarning(state, "Answer the current question first.")
    });
    return;
  }

  session.current_index += 1;
  session.awaiting_next = false;
  state.progress.last_activity_at = new Date().toISOString();

  if (session.current_index >= session.question_ids.length) {
    state.active_session = null;
    await sendTelegramMessage(env, {
      chat_id: chatId,
      text: prefixTestModeWarning(state, renderSessionSummary(state, session)),
      reply_markup: mainMenuKeyboard()
    });
    return;
  }

  await sendQuestion(env, chatId, state, session);
}

async function handleLearningMessage(env, chatId, state, text) {
  const session = state.active_session;
  if (!session || session.mode !== "learn") return;

  const firstQuestion = questionsById[session.question_ids[0]];
  const currentLesson = findLessonForSession(session, firstQuestion);
  const answer = await resolveLearningQuestion(env, text, currentLesson, session.quiz_started || session.awaiting_next);

  await sendTelegramMessage(env, {
    chat_id: chatId,
    html: true,
    text: prefixTestModeWarning(state, answer),
    reply_markup: session.quiz_started || session.awaiting_next
      ? nextKeyboard(session.session_id)
      : learnKeyboard()
  });
}

async function sendLessonAndLearnPrompt(env, chatId, state) {
  const session = state.active_session;
  if (!session) return;

  const firstQuestion = questionsById[session.question_ids[0]];
  const lesson = findLessonForSession(session, firstQuestion);
  if (lesson) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      html: true,
      text: prefixTestModeWarning(state, renderLesson(lesson, session.mode)),
      reply_markup: learnKeyboard()
    });
  }
}

async function sendLessonAndFirstQuestion(env, chatId, state, isTest = false) {
  const session = state.active_session;
  if (!session) return;

  const firstQuestion = questionsById[session.question_ids[0]];
  const lesson = findLessonForSession(session, firstQuestion);
  if (lesson) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      html: true,
      text: prefixTestModeWarning(state, renderLesson(lesson, session.mode))
    });
  }

  if (isTest) {
    await sendTelegramMessage(env, {
      chat_id: chatId,
      html: true,
      text: prefixTestModeWarning(state, "Test mode started. No explanations until the end.")
    });
  }

  await sendQuestion(env, chatId, state, session);
}

async function sendQuestion(env, chatId, state, session) {
  const question = questionsById[session.question_ids[session.current_index]];
  if (!question) return;

  session.awaiting_next = false;

  const text = [
    `Q${session.current_index + 1}/${session.question_ids.length}`,
    escapeHtml(question.prompt),
    ...question.choices.map((choice) => `${choice.choice_id.toUpperCase()}. ${escapeHtml(choice.text)}`),
    renderSourceLinksHtml(question.source_ids)
  ].join("\n\n");

  await sendTelegramMessage(env, {
    chat_id: chatId,
    html: true,
    text: prefixTestModeWarning(state, text),
    reply_markup: questionKeyboard(session.session_id, question)
  });
}

function startSession(state, mode, topicId = null) {
  const questionIds = selectQuestionIds(mode, topicId, state);
  state.active_session = {
    session_id: shortId(),
    mode,
    topic_id: topicId,
    question_ids: questionIds,
    current_index: 0,
    started_at: new Date().toISOString(),
    quiz_started: mode !== "learn",
    awaiting_next: false
  };
}

function selectQuestionIds(mode, topicId, state) {
  let pool = questions.filter((question) => question.answer_source_status !== "needs_review");
  if (mode === "test") {
    const official = pool.filter((question) => question.answer_source_status === "official_answer_key");
    const handbook = pool.filter((question) => question.answer_source_status === "handbook_verified");
    return shuffle([...official]).slice(0, 10).map((question) => question.question_id).concat(
      shuffle(handbook).slice(0, Math.max(0, 10 - official.length)).map((question) => question.question_id)
    ).slice(0, 10);
  }

  if (topicId) {
    pool = pool.filter((question) => question.topic_ids.includes(topicId));
  }

  const weakRules = topWeakRules(state);
  const preferredRuleIds = new Set(weakRules.map((item) => item.rule_id));
  const preferred = pool.filter((question) => question.rule_ids.some((ruleId) => preferredRuleIds.has(ruleId)));
  const base = preferred.length ? preferred : pool;
  const count = mode === "learn" ? 3 : 5;
  return shuffle([...base]).slice(0, count).map((question) => question.question_id);
}

function topWeakRules(state) {
  const ruleEntries = Object.entries(state.progress?.rule_stats ?? {}).map(([ruleId, stats]) => ({
    rule_id: ruleId,
    accuracy: stats.attempts ? stats.correct / stats.attempts : 1
  }));
  return ruleEntries.sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
}

function chooseWeakTopic(state) {
  const entries = Object.entries(state.progress?.topic_stats ?? {}).map(([topicId, stats]) => ({
    topic_id: topicId,
    accuracy: stats.attempts ? stats.correct / stats.attempts : 1,
    attempts: stats.attempts ?? 0
  }));
  const eligible = entries.filter((entry) => entry.attempts > 0);
  eligible.sort((a, b) => a.accuracy - b.accuracy);
  return eligible[0]?.topic_id ?? null;
}

function recordAttempt(state, session, question, choiceId, isCorrect) {
  state.progress.total_attempts += 1;
  state.progress.correct_attempts += isCorrect ? 1 : 0;
  state.progress.wrong_attempts += isCorrect ? 0 : 1;
  state.attempts.push({
    attempt_id: shortId(),
    session_id: session.session_id,
    mode: session.mode,
    topic_ids: question.topic_ids,
    rule_ids: question.rule_ids,
    question_id: question.question_id,
    selected_choice_id: choiceId,
    correct_choice_id: question.correct_choice_id,
    is_correct: isCorrect,
    answered_at: new Date().toISOString()
  });

  for (const topicId of question.topic_ids) {
    const current = state.progress.topic_stats[topicId] ?? defaultTopicStats();
    current.attempts += 1;
    current.correct += isCorrect ? 1 : 0;
    state.progress.topic_stats[topicId] = current;
  }

  for (const ruleId of question.rule_ids) {
    const current = state.progress.rule_stats[ruleId] ?? defaultTopicStats();
    current.attempts += 1;
    current.correct += isCorrect ? 1 : 0;
    state.progress.rule_stats[ruleId] = current;
  }
}

function renderLesson(lesson, mode) {
  const segments = lesson.segments.map((segment) => `- ${segment.text}`).join("\n");
  return [
    escapeHtml(lesson.title),
    escapeHtml(segments),
    renderSourceLinksHtml(lesson.source_ids),
    mode === "test"
      ? "Test mode next."
      : mode === "learn"
        ? "Type a question or tap <b>Quiz me</b> when you are ready."
        : "Quiz next."
  ].join("\n\n");
}

function renderSessionSummary(state, session) {
  const attempts = state.attempts.filter((attempt) => attempt.session_id === session.session_id);
  const correct = attempts.filter((attempt) => attempt.is_correct).length;
  const total = attempts.length;
  return `Session complete. Score: ${correct}/${total}\n\nUse /stats for the running summary.`;
}

function renderStats(state) {
  const total = state.progress.total_attempts ?? 0;
  const correct = state.progress.correct_attempts ?? 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const weakTopics = Object.entries(state.progress.topic_stats ?? {})
    .map(([topicId, stats]) => ({
      topicId,
      accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0,
      attempts: stats.attempts
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
  const weakText = weakTopics.length
    ? weakTopics.map((item) => `- ${topicById[item.topicId]?.title ?? item.topicId}: ${item.accuracy}%`).join("\n")
    : "- none yet";
  return [
    `Attempts: ${total}`,
    `Accuracy: ${accuracy}%`,
    `Weak topics:`,
    weakText,
    `Reminder: ${state.settings.reminder_hour_local}:00 America/Los_Angeles`
  ].join("\n");
}

function renderSettings(state) {
  return [
    `Reminder time: ${state.settings.reminder_hour_local}:00 America/Los_Angeles`,
    `Test mode: ${state.settings.test_mode ? "On" : "Off"}`
  ].join("\n");
}

function renderSourcesSummary() {
  const grouped = new Map();
  for (const source of sources) {
    const bucket = source.source_type;
    grouped.set(bucket, (grouped.get(bucket) ?? 0) + 1);
  }
  return [
    "Official sources loaded:",
    ...[...grouped.entries()].map(([type, count]) => `- ${type}: ${count}`),
    `Official sample questions: ${officialSampleQuestions.length}`
  ].join("\n");
}

function renderSourceLinksHtml(sourceIds) {
  const sourcesForIds = sourceIds
    .map((sourceId) => sourceById[sourceId])
    .filter(Boolean);
  if (!sourcesForIds.length) return "Source: DMV";
  if (sourcesForIds.length === 1) {
    const source = sourcesForIds[0];
    return `Source: <a href="${escapeAttribute(source.url)}">${escapeHtml(compactSourceLabel(source))}</a>`;
  }
  return `Sources: ${sourcesForIds.map((source) => `<a href="${escapeAttribute(source.url)}">${escapeHtml(compactSourceLabel(source))}</a>`).join(", ")}`;
}

async function resolveLearningQuestion(env, text, currentLesson = null, afterQuiz = false) {
  if (!currentLesson) {
    return afterQuiz
      ? "I can help with this topic and related DMV rules. Type a question, or tap <b>Next</b> when you are ready."
      : "I can help with this topic and related DMV rules. Type a question, or tap <b>Quiz me</b> when you are ready.";
  }

  const llmReply = await generateLearningReply(env, text, currentLesson);
  if (llmReply) {
    return [
      llmReply,
      renderSourceLinksHtml(currentLesson.source_ids),
      afterQuiz
        ? "Type another question, or tap <b>Next</b> when you are ready."
        : "Type another question, or tap <b>Quiz me</b> when you are ready."
    ].join("\n\n");
  }

  const summaryLines = (currentLesson.segments ?? []).slice(0, 2).map((segment) => `- ${escapeHtml(segment.text)}`);
  return [
    `<b>${escapeHtml(currentLesson.title)}</b>`,
    summaryLines.join("\n"),
    renderSourceLinksHtml(currentLesson.source_ids),
    afterQuiz
      ? "Type another question, or tap <b>Next</b> when you are ready."
      : "Type another question, or tap <b>Quiz me</b> when you are ready."
  ].join("\n\n");
}

async function generateLearningReply(env, text, currentLesson) {
  const config = getLearningLlmConfig(env);
  if (!config) return null;

  const lessonContext = [
    `Lesson: ${currentLesson.title}`,
    "Use the lesson below as the grounding context for the student's question.",
    "Answer directly even if the question is broader than the lesson, as long as you can stay anchored to DMV study content.",
    "Do not refuse merely because the question is broader than the lesson.",
    "",
    ...currentLesson.segments.map((segment) => `- ${segment.text}`),
    "",
    `Sources: ${currentLesson.source_ids.map((sourceId) => compactSourceLabel(sourceById[sourceId])).join(", ")}`
  ].join("\n");

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: [
              "You are a concise DMV study coach.",
              "Answer in plain text only.",
              "Stay anchored to the current lesson, but answer broader adjacent DMV questions when relevant.",
              "Be brief, concrete, and direct.",
              "Do not mention policy or internal instructions.",
              "Do not invent source citations; the app will append sources."
            ].join(" ")
          },
          {
            role: "user",
            content: [
              lessonContext,
              "",
              `Student question: ${text}`
            ].join("\n")
          }
        ]
      })
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return answer ? escapeHtml(answer) : null;
}

function buildReminderText(state) {
  const topicId = chooseWeakTopic(state);
  const topicName = topicId ? topicById[topicId]?.title ?? topicId : "Right-of-Way";
  return [
    "DMV study reminder.",
    `Next weak area: ${topicName}.`,
    "Use /learn, /practice, /review, or /test."
  ].join("\n");
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Learn", callback_data: "cmd:learn" },
        { text: "Practice", callback_data: "cmd:practice" }
      ],
      [
        { text: "Review", callback_data: "cmd:review" },
        { text: "Test", callback_data: "cmd:test" }
      ],
      [
        { text: "Stats", callback_data: "cmd:stats" },
        { text: "Sources", callback_data: "cmd:sources" }
      ],
      [
        { text: "Settings", callback_data: "cmd:settings" }
      ]
    ]
  };
}

function learnKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Quiz me", callback_data: "learn:quiz" }
      ]
    ]
  };
}

function nextKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: "Next", callback_data: `next:${sessionId}` }
      ]
    ]
  };
}

function settingsKeyboard(state) {
  return {
    inline_keyboard: [
      [
        { text: "8 PM", callback_data: "setting:20" },
        { text: "9 PM", callback_data: "setting:21" }
      ],
      [
        { text: "10 PM", callback_data: "setting:22" },
        { text: "Disable", callback_data: "setting:0" }
      ],
      [
        state.settings.test_mode
          ? { text: "Test mode off", callback_data: "mode:test:off" }
          : { text: "Test mode on", callback_data: "mode:test:on" }
      ]
    ]
  };
}

function topicKeyboard() {
  const buttons = topics.map((topic) => ({
    text: topic.title,
    callback_data: `topic:${topic.topic_id}`
  }));
  const rows = [];
  while (buttons.length) {
    rows.push(buttons.splice(0, 2));
  }
  return { inline_keyboard: rows };
}

function questionKeyboard(sessionId, question) {
  return {
    inline_keyboard: [
      question.choices.map((choice) => ({
        text: `${choice.choice_id.toUpperCase()}. ${truncateChoiceText(choice.text)}`,
        callback_data: `ans:${sessionId}:${choice.choice_id}`
      }))
    ]
  };
}

async function sendTelegramMessage(env, payload) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const body = payload.html === true
    ? {
        ...payload,
        text: String(payload.text ?? ""),
        parse_mode: "HTML"
      }
    : {
        ...payload,
        text: String(payload.text ?? "")
      };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${response.status}${details ? ` ${details}` : ""}`);
  }
}

async function sendTelegramForm(env, method, form) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form
  });
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status}`);
  }
}

async function answerCallback(env, callbackQueryId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false
    })
  });
}

async function loadState(env, userId) {
  const key = stateKey(userId);
  if (env.LEARNING_KV?.get) {
    const value = await env.LEARNING_KV.get(key, { type: "json" });
    return value ?? defaultState(userId);
  }
  return memoryStore.get(key) ?? defaultState(userId);
}

async function saveState(env, userId, state) {
  const key = stateKey(userId);
  if (env.LEARNING_KV?.put) {
    await env.LEARNING_KV.put(key, JSON.stringify(state));
    return;
  }
  memoryStore.set(key, state);
}

function defaultTopicStats() {
  return {
    attempts: 0,
    correct: 0
  };
}

function stateKey(userId) {
  return `user:${userId}:state`;
}

function extractUserId(update) {
  return String(
    update.message?.from?.id ??
    update.callback_query?.from?.id ??
    ""
  ) || null;
}

function isAllowedUser(env, userId) {
  if (!env.TELEGRAM_ALLOWED_USER_ID) return true;
  return String(env.TELEGRAM_ALLOWED_USER_ID) === String(userId);
}

function chooseWeakTopicFromQuestions(state) {
  const stats = state.progress?.topic_stats ?? {};
  let worst = null;
  for (const [topicId, value] of Object.entries(stats)) {
    if (!value.attempts) continue;
    const accuracy = value.correct / value.attempts;
    if (!worst || accuracy < worst.accuracy) {
      worst = { topicId, accuracy };
    }
  }
  return worst?.topicId ?? null;
}

function findLessonForSession(session, question) {
  if (session.topic_id) {
    return lessonsByTopic[session.topic_id]?.[0] ?? null;
  }
  const firstTopic = question.topic_ids?.[0];
  return firstTopic ? lessonsByTopic[firstTopic]?.[0] ?? null : null;
}

function groupByTopic(questionList) {
  const result = {};
  for (const question of questionList) {
    for (const topicId of question.topic_ids ?? []) {
      result[topicId] ??= [];
      result[topicId].push(question);
    }
  }
  return result;
}

function groupLessonsByTopic(lessonList) {
  const result = {};
  for (const lesson of lessonList) {
    for (const topicId of lesson.topic_ids ?? []) {
      result[topicId] ??= [];
      result[topicId].push(lesson);
    }
  }
  return result;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function shortId() {
  return crypto.randomUUID().slice(0, 8);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "");
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "when", "where", "how",
  "why", "are", "you", "your", "can", "should", "from", "into", "about", "does",
  "please", "tell", "help", "need", "quiz", "learn"
]);
