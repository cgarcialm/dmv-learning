import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTestModeCommand,
  compactSourceLabel,
  getLearningLlmConfig,
  defaultState,
  persistState,
  prefixTestModeWarning,
  stripTrailingSlash,
  truncateChoiceText
} from "../src/bot-helpers.js";

test("compactSourceLabel shortens official DMV sample tests", () => {
  assert.equal(compactSourceLabel({
    source_id: "ca-dmv-sample-test-5",
    title: "California DMV Sample Class C Written Test 5"
  }), "Sample Test 5");
});

test("compactSourceLabel shortens handbook sections", () => {
  assert.equal(compactSourceLabel({
    source_id: "ca-dmv-handbook-section-6-navigating-roads",
    title: "California Driver Handbook - Section 6: Navigating the Roads"
  }), "Handbook §6");
});

test("prefixTestModeWarning only prefixes in test mode", () => {
  assert.equal(prefixTestModeWarning({ settings: { test_mode: false } }, "hello"), "hello");
  assert.equal(
    prefixTestModeWarning({ settings: { test_mode: true } }, "hello"),
    "TEST MODE: progress is not being saved.\n\nhello"
  );
});

test("applyTestModeCommand supports on, off, and toggle", () => {
  const state = { settings: { test_mode: false }, active_session: { session_id: "x" } };

  applyTestModeCommand(state, "/testmode on");
  assert.equal(state.settings.test_mode, true);
  assert.equal(state.active_session, null);

  applyTestModeCommand(state, "/testmode off");
  assert.equal(state.settings.test_mode, false);
  assert.equal(state.active_session, null);

  applyTestModeCommand(state, "/testmode");
  assert.equal(state.settings.test_mode, true);
});

test("persistState drops progress and attempts when test mode is on", () => {
  const state = defaultState("123");
  state.settings.test_mode = true;
  state.progress.total_attempts = 12;
  state.attempts.push({ attempt_id: "a1" });

  const persisted = persistState({}, state);
  assert.equal(persisted.profile.telegram_user_id, "123");
  assert.deepEqual(persisted.progress, defaultState("123").progress);
  assert.deepEqual(persisted.attempts, []);
});

test("persistState preserves live progress when test mode is off", () => {
  const state = defaultState("123");
  state.progress.total_attempts = 7;
  state.attempts.push({ attempt_id: "a1" });

  const persisted = persistState({}, state);
  assert.equal(persisted.progress.total_attempts, 7);
  assert.equal(persisted.attempts.length, 1);
});

test("stripTrailingSlash normalizes provider URLs", () => {
  assert.equal(stripTrailingSlash("https://api.example.com/v1///"), "https://api.example.com/v1");
});

test("truncateChoiceText shortens long answer labels", () => {
  assert.equal(truncateChoiceText("abcdefghijklmnopqrstuvwxyz", 10), "abcdefghi…");
  assert.equal(truncateChoiceText("short", 10), "short");
});

test("getLearningLlmConfig prefers generic config over provider-specific config", () => {
  const config = getLearningLlmConfig({
    LLM_API_KEY: "generic-key",
    LLM_MODEL: "generic-model",
    LLM_BASE_URL: "https://generic.example.com/v1///",
    NVIDIA_API_KEY: "nvidia-key",
    NVIDIA_MODEL: "nvidia-model",
    NVIDIA_BASE_URL: "https://nvidia.example.com/v1"
  });

  assert.deepEqual(config, {
    apiKey: "generic-key",
    model: "generic-model",
    baseUrl: "https://generic.example.com/v1"
  });
});

test("getLearningLlmConfig falls back to NVIDIA config when generic config is absent", () => {
  const config = getLearningLlmConfig({
    NVIDIA_API_KEY: "nvidia-key",
    NVIDIA_MODEL: "openai/gpt-oss-120b",
    NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1/"
  });

  assert.deepEqual(config, {
    apiKey: "nvidia-key",
    model: "openai/gpt-oss-120b",
    baseUrl: "https://integrate.api.nvidia.com/v1"
  });
});
