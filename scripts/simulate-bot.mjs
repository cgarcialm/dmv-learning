import bot from "../src/worker.js";

const sentMessages = [];
const telegramFetch = globalThis.fetch;

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
