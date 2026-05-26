import test from "node:test";
import assert from "node:assert/strict";
import bot from "../src/worker.js";

function createRuntime() {
  const sentMessages = [];
  const memory = new Map();
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (String(url).includes("api.telegram.org")) {
      const body = init.body ?? (typeof input !== "string" ? input.body : undefined);
      sentMessages.push({
        url: String(url),
        body: await readBody(body)
      });
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return nativeFetch(input, init);
  };

  const env = {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_ALLOWED_USER_ID: "123",
    LEARNING_KV: {
      async get(key, options) {
        const value = memory.get(key);
        if (options?.type === "json") return value ? JSON.parse(value) : null;
        return value ?? null;
      },
      async put(key, value) {
        memory.set(key, value);
      }
    }
  };

  return {
    sentMessages,
    env,
    async dispatch(update) {
      const request = new Request("http://localhost/telegram-webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update)
      });
      const response = await bot.fetch(request, env, {});
      assert.equal(response.status, 200);
    }
  };
}

function parseMessages(sentMessages) {
  return sentMessages.map((entry) => {
    try {
      return JSON.parse(entry.body);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function readBody(body) {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof FormData) {
    const entries = [];
    for (const [key, value] of body.entries()) {
      entries.push([key, value instanceof File ? { name: value.name, size: value.size } : String(value)]);
    }
    return JSON.stringify(entries);
  }
  if (body instanceof Blob) return await body.text();
  return String(body);
}

test("start sends the main menu", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/start"
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  const startMessage = messages.at(-1);
  assert.equal(startMessage.text.startsWith("DMV learning bot is ready."), true);
  assert.equal(startMessage.reply_markup.inline_keyboard[0][0].text, "Learn");
});

test("learn sends one lesson prompt with one Quiz me button", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/learn"
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  const lessonMessage = messages.at(-1);
  assert.equal(String(lessonMessage.text).includes("Quiz me"), true);
  assert.equal(lessonMessage.reply_markup.inline_keyboard.length, 1);
  assert.equal(lessonMessage.reply_markup.inline_keyboard[0][0].text, "Quiz me");
});

test("learn text keeps the current lesson when no LLM key is configured", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/learn"
    }
  });
  runtime.sentMessages.length = 0;

  await runtime.dispatch({
    message: {
      message_id: 2,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "What is SR-1?"
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  const reply = messages.at(-1);
  assert.equal(String(reply.text).includes("Type another question"), true);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].text, "Quiz me");
});

test("Quiz me starts quiz mode and sends an answer keyboard", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/learn"
    }
  });
  const learnMessages = parseMessages(runtime.sentMessages);
  const learnPayload = learnMessages.at(-1);
  const quizButton = learnPayload.reply_markup.inline_keyboard[0][0];
  runtime.sentMessages.length = 0;

  await runtime.dispatch({
    callback_query: {
      id: "cbq-1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      message: {
        message_id: 2,
        chat: { id: 456, type: "private" }
      },
      data: quizButton.callback_data
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  const quizStart = messages.find((message) => String(message.text).startsWith("Quiz mode started"));
  const question = messages.find((message) => String(message.text).startsWith("Q1/"));
  assert.ok(quizStart);
  assert.ok(question);
  assert.equal(question.reply_markup.inline_keyboard[0].length > 0, true);
});

test("answer feedback waits for Next before advancing", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/learn"
    }
  });

  const learnMessages = parseMessages(runtime.sentMessages);
  const learnPayload = learnMessages.at(-1);
  const quizButton = learnPayload.reply_markup.inline_keyboard[0][0];
  runtime.sentMessages.length = 0;

  await runtime.dispatch({
    callback_query: {
      id: "cbq-1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      message: {
        message_id: 2,
        chat: { id: 456, type: "private" }
      },
      data: quizButton.callback_data
    }
  });

  const quizMessages = parseMessages(runtime.sentMessages);
  const quizQuestion = quizMessages.find((message) => String(message.text).startsWith("Q1/"));
  const answerButton = quizQuestion.reply_markup.inline_keyboard[0][0];
  runtime.sentMessages.length = 0;

  await runtime.dispatch({
    callback_query: {
      id: "cbq-2",
      from: { id: 123, is_bot: false, first_name: "Test" },
      message: {
        message_id: 3,
        chat: { id: 456, type: "private" }
      },
      data: answerButton.callback_data
    }
  });

  const afterAnswerMessages = parseMessages(runtime.sentMessages);
  const feedback = afterAnswerMessages.find((message) => String(message.text).startsWith("Correct.") || String(message.text).startsWith("Incorrect."));
  assert.ok(feedback);
  assert.equal(feedback.reply_markup.inline_keyboard[0][0].text, "Next");
  assert.equal(afterAnswerMessages.some((message) => String(message.text).startsWith("Q2/")), false);

  runtime.sentMessages.length = 0;
  const nextButton = feedback.reply_markup.inline_keyboard[0][0];

  await runtime.dispatch({
    callback_query: {
      id: "cbq-3",
      from: { id: 123, is_bot: false, first_name: "Test" },
      message: {
        message_id: 4,
        chat: { id: 456, type: "private" }
      },
      data: nextButton.callback_data
    }
  });

  const nextMessages = parseMessages(runtime.sentMessages);
  assert.equal(nextMessages.some((message) => String(message.text).startsWith("Q2/")), true);
});

test("practice starts a question flow", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/practice"
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  const question = messages.find((message) => String(message.text).startsWith("Q1/"));
  assert.ok(question);
  assert.equal(question.reply_markup.inline_keyboard[0].length > 0, true);
});

test("test mode sends its no-explanations banner", async () => {
  const runtime = createRuntime();

  await runtime.dispatch({
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 456, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/test"
    }
  });

  const messages = parseMessages(runtime.sentMessages);
  assert.equal(messages.some((message) => String(message.text).includes("Test mode started. No explanations until the end.")), true);
});
