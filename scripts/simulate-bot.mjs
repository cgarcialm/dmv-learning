import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bot from "../src/worker.js";

const sentMessages = [];
const nativeFetch = globalThis.fetch.bind(globalThis);
const localEnv = await loadDotEnvFile(".env");
const memory = new Map();

const env = {
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_ALLOWED_USER_ID: "123",
  TELEGRAM_WEBHOOK_PATH: "telegram-webhook",
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

const rl = readline.createInterface({
  input,
  output,
  terminal: true,
  prompt: "dmv> "
});

const chatId = 456;
const userId = 123;
let messageId = 1;
let lastSeenMessageIndex = 0;
let activeButtons = [];

printBanner();
await flushBotMessages();
rl.prompt();

for await (const line of rl) {
  const command = line.trim();

  if (!command) {
    rl.prompt();
    continue;
  }

  if (isQuitCommand(command)) {
    rl.close();
    break;
  }

  if (command === "help") {
    printHelp();
    rl.prompt();
    continue;
  }

  if (command === "buttons") {
    printButtons();
    rl.prompt();
    continue;
  }

  if (command === "clear") {
    console.clear();
    printBanner();
    printButtons();
    rl.prompt();
    continue;
  }

  if (await tryHandleClick(command)) {
    await flushBotMessages();
    rl.prompt();
    continue;
  }

  const matchedButton = command.startsWith("/") ? null : matchActiveButton(command);
  if (matchedButton) {
    await dispatchCallback(matchedButton.callback_data);
    await flushBotMessages();
    rl.prompt();
    continue;
  }

  await dispatchMessage(command);
  await flushBotMessages();
  rl.prompt();
}

function printBanner() {
  console.log("DMV chat simulator");
  console.log("Type a Telegram command or free text.");
  console.log("Commands: help, buttons, click N, N, clear, quit");
  console.log("Examples: /start, /learn, /practice, /review, /test, /stats, /settings");
  console.log("Tip: type 1, 2, 3... to choose the matching active button.");
  console.log("");
}

function printHelp() {
  console.log("Commands:");
  console.log("  help        Show this help");
  console.log("  buttons     Show the active buttons");
  console.log("  click N     Click button N from the latest bot keyboard");
  console.log("  N           Same as click N");
  console.log("  clear       Clear the screen and redraw the banner");
  console.log("  quit        Exit");
  console.log("");
}

function printButtons() {
  if (!activeButtons.length) {
    console.log("(no active buttons)");
    console.log("");
    return;
  }

  console.log("Active buttons:");
  activeButtons.forEach((button, index) => {
    console.log(`  ${index + 1}. ${button.text}`);
  });
  console.log("");
}

function isQuitCommand(command) {
  return ["quit", "exit", ":q"].includes(command.toLowerCase());
}

async function tryHandleClick(command) {
  const numeric = command.match(/^(\d+)$/);
  const match = command.match(/^(?:click|c)\s+(\d+)$/i) ?? numeric;
  if (!match) return false;

  const index = Number(match[1]) - 1;
  const button = activeButtons[index];
  if (!button) {
    console.log(`No button ${match[1]} is active.`);
    console.log("");
    return true;
  }

  await dispatchCallback(button.callback_data);
  return true;
}

function matchActiveButton(command) {
  const normalized = String(command).trim().toLowerCase();
  if (!normalized) return null;
  return activeButtons.find((button) => String(button.text ?? "").trim().toLowerCase() === normalized) ?? null;
}

async function dispatchMessage(text) {
  console.log(`You: ${text}`);
  console.log("");
  await bot.fetch(makeTelegramRequest({
    message: {
      message_id: messageId,
      from: { id: userId, is_bot: false, first_name: "Test" },
      chat: { id: chatId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text
    }
  }), env, {});
  messageId += 1;
}

async function dispatchCallback(callbackData) {
  console.log(`You clicked: ${callbackData}`);
  console.log("");
  await bot.fetch(makeTelegramRequest({
    callback_query: {
      id: `cbq-${messageId}`,
      from: { id: userId, is_bot: false, first_name: "Test" },
      message: {
        message_id: messageId,
        chat: { id: chatId, type: "private" }
      },
      data: callbackData
    }
  }), env, {});
  messageId += 1;
  await flushBotMessages();
}

async function flushBotMessages() {
  const newMessages = sentMessages.slice(lastSeenMessageIndex);
  if (!newMessages.length) {
    return;
  }

  for (const entry of newMessages) {
    const payload = tryParseJSON(entry.body);
    if (!payload?.text) continue;

    console.log("DMVot:");
    console.log(renderForTerminal(payload));
    console.log("");

    const flattenedButtons = flattenButtons(payload.reply_markup?.inline_keyboard ?? []);
    if (flattenedButtons.length) {
      activeButtons = flattenedButtons;
      printButtons();
    } else {
      activeButtons = activeButtons.length ? activeButtons : [];
    }
  }

  lastSeenMessageIndex = sentMessages.length;
}

function flattenButtons(rows) {
  const buttons = [];
  for (const row of rows) {
    for (const button of row) {
      buttons.push({
        text: button.text,
        callback_data: button.callback_data
      });
    }
  }
  return buttons;
}

function renderForTerminal(payload) {
  const text = String(payload.text ?? "");
  if (payload.parse_mode === "HTML") {
    return htmlToText(text);
  }
  return text;
}

function htmlToText(html) {
  let text = String(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<a\s+href="([^"]+)">([\s\S]*?)<\/a>/gi, (_, url, label) => `${stripTags(label)} (${url})`);
  text = text.replace(/<\/?(b|strong|i|em|code|pre)>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  return decodeEntities(text);
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, "");
}

function decodeEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

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
