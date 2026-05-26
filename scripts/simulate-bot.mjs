import fs from "node:fs/promises";
import bot from "../src/worker.js";

const sentMessages = [];
const telegramFetch = globalThis.fetch;
const localEnv = await loadDotEnvFile(".env");

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
  return telegramFetch(input, init);
};

const memory = new Map();
const env = {
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_ALLOWED_USER_ID: "123",
  LLM_API_KEY: localEnv.LLM_API_KEY ?? process.env.LLM_API_KEY,
  LLM_MODEL: localEnv.LLM_MODEL ?? process.env.LLM_MODEL,
  LLM_BASE_URL: localEnv.LLM_BASE_URL ?? process.env.LLM_BASE_URL,
  OPENAI_API_KEY: localEnv.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
  OPENAI_MODEL: localEnv.OPENAI_MODEL ?? process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: localEnv.OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
  NVIDIA_API_KEY: localEnv.NVIDIA_API_KEY ?? process.env.NVIDIA_API_KEY,
  NVIDIA_MODEL: localEnv.NVIDIA_MODEL ?? process.env.NVIDIA_MODEL,
  NVIDIA_BASE_URL: localEnv.NVIDIA_BASE_URL ?? process.env.NVIDIA_BASE_URL,
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

const chatId = 456;
const userId = 123;

await bot.fetch(makeTelegramRequest({
  message: {
    message_id: 1,
    from: { id: userId, is_bot: false, first_name: "Test" },
    chat: { id: chatId, type: "private" },
    date: Math.floor(Date.now() / 1000),
    text: "/start"
  }
}), env, {});

await bot.fetch(makeTelegramRequest({
  message: {
    message_id: 2,
    from: { id: userId, is_bot: false, first_name: "Test" },
    chat: { id: chatId, type: "private" },
    date: Math.floor(Date.now() / 1000),
    text: "/learn"
  }
}), env, {});

const questionMessage = sentMessages
  .map((entry) => tryParseJSON(entry.body))
  .filter((payload) => payload?.reply_markup?.inline_keyboard?.length && String(payload.text ?? "").startsWith("Q"))
  .at(-1);

const firstChoice = questionMessage?.reply_markup?.inline_keyboard?.[0]?.[0];
if (firstChoice?.callback_data) {
  await bot.fetch(makeTelegramRequest({
    callback_query: {
      id: "cbq-1",
      from: { id: userId, is_bot: false, first_name: "Test" },
      message: {
        message_id: 3,
        chat: { id: chatId, type: "private" }
      },
      data: firstChoice.callback_data
    }
  }), env, {});
}

console.log(JSON.stringify(sentMessages, null, 2));

function makeTelegramRequest(update) {
  return new Request("http://localhost/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update)
  });
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

function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadDotEnvFile(filename) {
  try {
    const raw = await fs.readFile(filename, "utf8");
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

function parseDotEnv(raw) {
  const result = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    result[key] = unquote(value.trim());
  }
  return result;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
