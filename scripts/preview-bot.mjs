import fs from "node:fs/promises";
import path from "node:path";
import bot from "../src/worker.js";

const sentMessages = [];
const commands = process.argv.slice(2);
const nativeFetch = globalThis.fetch.bind(globalThis);
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
  return nativeFetch(input, init);
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

await runCommands(commands.length ? commands : ["/start", "/learn"], env);

const html = renderHtml(sentMessages.map((entry) => tryParseJSON(entry.body)).filter(Boolean));
const outputPath = path.resolve("tmp", "bot-preview.html");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");

console.log(outputPath);

function makeTelegramRequest(update) {
  return new Request("http://localhost/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update)
  });
}

async function runCommands(commandList, runtimeEnv) {
  let messageId = 1;
  for (const command of commandList) {
    if (command === "click:first") {
      const questionMessage = sentMessages
        .map((entry) => tryParseJSON(entry.body))
        .filter((payload) => payload?.reply_markup?.inline_keyboard?.length && String(payload.text ?? "").startsWith("Q"))
        .at(-1);
      const firstChoice = questionMessage?.reply_markup?.inline_keyboard?.[0]?.[0];
      if (firstChoice?.callback_data) {
        await bot.fetch(makeTelegramRequest({
          callback_query: {
            id: `cbq-${messageId}`,
            from: { id: userId, is_bot: false, first_name: "Test" },
            message: {
              message_id: messageId + 1,
              chat: { id: chatId, type: "private" }
            },
            data: firstChoice.callback_data
          }
        }), runtimeEnv, {});
        messageId += 1;
      }
      continue;
    }

    await bot.fetch(makeTelegramRequest({
      message: {
        message_id: messageId,
        from: { id: userId, is_bot: false, first_name: "Test" },
        chat: { id: chatId, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: command
      }
    }), runtimeEnv, {});
    messageId += 1;
  }
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

function renderHtml(payloads) {
  const messages = [];
  for (const payload of payloads) {
    if (payload.text) {
      messages.push({
        role: isBotMessage(payload) ? "bot" : "user",
        text: payload.text,
        buttons: payload.reply_markup?.inline_keyboard ?? [],
        html: payload.parse_mode === "HTML"
      });
    }
  }

  const body = messages.map((message) => {
    const buttons = message.buttons.length
      ? `<div class="buttons">${message.buttons.map((row) => `<div class="button-row">${row.map((button) => `<button type="button">${escapeHtml(button.text)}</button>`).join("")}</div>`).join("")}</div>`
      : "";
    return `
      <section class="message ${message.role}">
        <div class="role">${message.role === "bot" ? "DMVot" : "You"}</div>
        <div class="text">${message.html ? message.text : formatText(message.text)}</div>
        ${buttons}
      </section>
    `;
  }).join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>DMV Bot Preview</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #0f172a;
          --panel: #172036;
          --panel-alt: #1e2a44;
          --text: #e5eefb;
          --muted: #9fb1ca;
          --accent: #4ea1ff;
          --border: #2b3a58;
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: linear-gradient(180deg, #0b1220, var(--bg));
          color: var(--text);
        }
        .wrap {
          max-width: 920px;
          margin: 0 auto;
          padding: 24px;
        }
        .title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 16px;
          color: var(--muted);
        }
        .message {
          border: 1px solid var(--border);
          background: var(--panel);
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
        }
        .message.user {
          background: #112036;
        }
        .message.bot {
          background: var(--panel-alt);
        }
        .role {
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 10px;
        }
        .text {
          white-space: pre-wrap;
          line-height: 1.45;
        }
        .buttons {
          margin-top: 14px;
        }
        .button-row {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        button {
          appearance: none;
          border: 1px solid var(--border);
          background: #24324d;
          color: var(--text);
          border-radius: 10px;
          padding: 10px 12px;
          font: inherit;
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="title">DMV Bot Preview</div>
        ${body}
      </div>
    </body>
  </html>`;
}

function isBotMessage(payload) {
  return typeof payload.text === "string" && !payload.text.startsWith("/start");
}

function formatText(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
