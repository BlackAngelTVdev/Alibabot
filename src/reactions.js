import { getSetting, setSetting } from "./db.js";

const MAX_TRIGGER_LENGTH = 40;
const MAX_RESPONSE_LENGTH = 200;
const MAX_VARIANT_LENGTH = 60;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWord(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`]/g, " ")
    .trim();
}

function normalizeReaction(entry) {
  const trigger = normalizeWord(entry?.trigger);
  const response = String(entry?.response ?? "").trim();

  if (!trigger || trigger.length > MAX_TRIGGER_LENGTH) {
    throw new Error(`Le mot déclencheur doit faire entre 1 et ${MAX_TRIGGER_LENGTH} caractères.`);
  }

  if (!response || response.length > MAX_RESPONSE_LENGTH) {
    throw new Error(`La réponse doit faire entre 1 et ${MAX_RESPONSE_LENGTH} caractères.`);
  }

  const variants = [...new Set(
    (Array.isArray(entry?.variants) ? entry.variants : [])
      .map(normalizeWord)
      .filter(Boolean)
      .filter((variant) => variant.length <= MAX_VARIANT_LENGTH)
  )].filter((variant) => variant !== trigger);

  const count = Number.isInteger(entry?.count) && entry.count >= 0 ? entry.count : 0;

  return { trigger, response, variants, count };
}

function normalizeReactions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const reactions = [];

  for (const entry of raw) {
    try {
      const reaction = normalizeReaction(entry);
      if (seen.has(reaction.trigger)) {
        continue;
      }
      seen.add(reaction.trigger);
      reactions.push(reaction);
    } catch {
      // Entrée invalide : on l'ignore silencieusement.
    }
  }

  return reactions;
}

export function readReactions() {
  const stored = getSetting("reactions");

  if (!Array.isArray(stored)) {
    return [];
  }

  return normalizeReactions(stored);
}

function persistReactions(reactions) {
  setSetting("reactions", reactions);
}

export function createReaction(trigger, response) {
  const reaction = normalizeReaction({ trigger, response, variants: [] });
  const reactions = readReactions();

  if (reactions.some((existing) => existing.trigger === reaction.trigger)) {
    throw new Error(`La réaction « ${reaction.trigger} » existe déjà.`);
  }

  reactions.push(reaction);
  persistReactions(reactions);
  return reaction;
}

export function updateReaction(trigger, patch = {}) {
  const reactions = readReactions();
  const index = reactions.findIndex((reaction) => reaction.trigger === trigger);

  if (index === -1) {
    throw new Error("Réaction introuvable.");
  }

  const current = reactions[index];
  const next = normalizeReaction({
    trigger: current.trigger,
    response: typeof patch.response === "string" ? patch.response : current.response,
    variants: Array.isArray(patch.variants) ? patch.variants : current.variants,
    count: current.count
  });

  reactions[index] = next;
  persistReactions(reactions);
  return next;
}

export function incrementReactionCount(trigger) {
  const reactions = readReactions();
  const index = reactions.findIndex((reaction) => reaction.trigger === trigger);

  if (index === -1) {
    return null;
  }

  const updated = { ...reactions[index], count: (reactions[index].count ?? 0) + 1 };
  reactions[index] = updated;
  persistReactions(reactions);
  return updated;
}

export function deleteReaction(trigger) {
  const reactions = readReactions();
  const next = reactions.filter((reaction) => reaction.trigger !== trigger);

  if (next.length === reactions.length) {
    throw new Error("Réaction introuvable.");
  }

  persistReactions(next);
}

export function findReaction(messageContent) {
  if (typeof messageContent !== "string" || messageContent.length === 0) {
    return null;
  }

  const normalized = normalizeWord(messageContent);

  for (const reaction of readReactions()) {
    const words = [reaction.trigger, ...reaction.variants];

    const matched = words.some((word) => {
      const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "u");
      return pattern.test(normalized);
    });

    if (matched) {
      return reaction;
    }
  }

  return null;
}
