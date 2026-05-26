export function defaultSettings() {
  return {
    daily_reminder_enabled: true,
    reminder_hour_local: 20,
    test_mode: false
  };
}

export function defaultState(userId) {
  return {
    profile: {
      telegram_user_id: String(userId),
      started_at: null,
      chat_id: null
    },
    settings: defaultSettings(),
    progress: {
      total_attempts: 0,
      correct_attempts: 0,
      wrong_attempts: 0,
      last_activity_at: null,
      last_reminder_day: null,
      last_reminder_at: null,
      topic_stats: {},
      rule_stats: {}
    },
    attempts: [],
    active_session: null
  };
}

export function persistState(env, state) {
  const persistProgress = String(env.TELEGRAM_PERSIST_PROGRESS ?? "true").toLowerCase() !== "false";
  if (!persistProgress) return state;
  const current = defaultState(state.profile.telegram_user_id);
  current.profile = state.profile;
  current.settings = state.settings;
  current.active_session = state.active_session;
  current.progress = state.settings.test_mode ? current.progress : state.progress;
  current.attempts = state.settings.test_mode ? current.attempts : state.attempts;
  return current;
}

export function prefixTestModeWarning(state, text) {
  if (!state?.settings?.test_mode) return text;
  return [
    "TEST MODE: progress is not being saved.",
    text
  ].join("\n\n");
}

export function applyTestModeCommand(state, text) {
  const parts = text.split(/\s+/).slice(1).filter(Boolean);
  const value = parts[0]?.toLowerCase();
  if (value === "on") {
    state.settings.test_mode = true;
    state.active_session = null;
    return;
  }
  if (value === "off") {
    state.settings.test_mode = false;
    state.active_session = null;
    return;
  }
  state.settings.test_mode = !state.settings.test_mode;
  state.active_session = null;
}

export function compactSourceLabel(source) {
  const sourceId = String(source?.source_id ?? "");
  const citation = String(source?.citation_label ?? "");
  const title = String(source?.title ?? "");
  const sampleMatch = sourceId.match(/sample-test-(\d+)/i) || title.match(/Test\s*(\d+)/i) || citation.match(/Test\s*(\d+)/i);
  if (sampleMatch) return `Sample Test ${sampleMatch[1]}`;

  const sectionMatch = citation.match(/Section\s*(\d+)/i) || title.match(/Section\s*(\d+)/i) || sourceId.match(/section-(\d+)/i);
  if (sectionMatch) return `Handbook §${sectionMatch[1]}`;

  if (sourceId.includes("handbook-root")) return "Handbook";
  return citation || title || sourceId || "DMV";
}

export function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

export function truncateChoiceText(text, maxLength = 44) {
  const value = String(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function getLearningLlmConfig(env) {
  const genericKey = String(env.LLM_API_KEY ?? "").trim();
  const genericModel = String(env.LLM_MODEL ?? "").trim();
  const genericBaseUrl = String(env.LLM_BASE_URL ?? "").trim();
  if (genericKey) {
    return {
      apiKey: genericKey,
      model: genericModel || "gpt-4.1-mini",
      baseUrl: stripTrailingSlash(genericBaseUrl || "https://api.openai.com/v1")
    };
  }

  const openaiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      model: String(env.OPENAI_MODEL ?? "").trim() || "gpt-4.1-mini",
      baseUrl: stripTrailingSlash(String(env.OPENAI_BASE_URL ?? "").trim() || "https://api.openai.com/v1")
    };
  }

  const nvidiaKey = String(env.NVIDIA_API_KEY ?? "").trim();
  if (nvidiaKey) {
    return {
      apiKey: nvidiaKey,
      model: String(env.NVIDIA_MODEL ?? "").trim() || "openai/gpt-oss-120b",
      baseUrl: stripTrailingSlash(String(env.NVIDIA_BASE_URL ?? "").trim() || "https://integrate.api.nvidia.com/v1")
    };
  }

  return null;
}
