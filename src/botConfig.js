import { getSetting, setSetting } from "./db.js";

const DEFAULT_PREFIX = "!";
const MAX_PREFIX_LENGTH = 5;

export function readBotPrefix() {
  const stored = getSetting("bot_prefix");
  const prefix = String(stored ?? DEFAULT_PREFIX).trim();

  if (!prefix || prefix.length > MAX_PREFIX_LENGTH) {
    return DEFAULT_PREFIX;
  }

  return prefix;
}

export function writeBotPrefix(prefix) {
  const normalized = String(prefix ?? "").trim();

  if (!normalized || normalized.length > MAX_PREFIX_LENGTH) {
    throw new Error(`Le préfixe doit faire entre 1 et ${MAX_PREFIX_LENGTH} caractères.`);
  }

  setSetting("bot_prefix", normalized);
  return normalized;
}
