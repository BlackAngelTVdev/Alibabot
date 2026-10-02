import { getSetting, setSetting, watchSetting } from "./db.js";

const MAX_TRIGGER_LENGTH = 40;
const MAX_RESPONSE_LENGTH = 200;
const MAX_VARIANT_LENGTH = 60;

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

// ————— Index de recherche (en mémoire) —————
// Le bot cherche le déclencheur sur CHAQUE message reçu : on préconstruit un index
// (une map mot → réaction) pour éviter de relire la base à chaque message. L'index est
// invalidé automatiquement à chaque écriture de la clé « reactions » (via watchSetting)
// et rafraîchi par le job de maintenance nocturne (src/maintenance.js).
//
// Seule la FIN du message compte : le déclencheur doit être le dernier mot
// (« ca va ou quoi » déclenche, « quoi comment c'est possible » non).

let matchIndex = null;

function buildMatchIndex(reactions) {
  const wordToReaction = new Map();
  const words = new Set();

  for (const reaction of reactions) {
    for (const word of [reaction.trigger, ...reaction.variants]) {
      const key = normalizeWord(word);
      if (key && !words.has(key)) {
        words.add(key);
        wordToReaction.set(key, reaction);
      }
    }
  }

  // Nombre de mots du plus long déclencheur (ex. « ca va » → 2) : on teste les
  // suffixes du message du plus long au plus court.
  let maxWordTokens = 1;
  for (const word of words) {
    maxWordTokens = Math.max(maxWordTokens, word.split(/\s+/).length);
  }

  return { wordToReaction, maxWordTokens };
}

// Reconstruit l'index depuis la base (appelé par la maintenance nocturne).
export function rebuildReactionIndex() {
  matchIndex = buildMatchIndex(readReactions());
  return matchIndex;
}

// Toute écriture de la clé « reactions » (API, seeder, migration…) invalide l'index.
watchSetting("reactions", () => {
  matchIndex = null;
});

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

  if (!matchIndex) {
    rebuildReactionIndex();
  }

  // Découpage en mots (la ponctuation et les emojis servent de séparateurs) :
  // « quoi ? » → ["quoi"], « c'est quoi » → ["c", "est", "quoi"].
  const tokens = normalizeWord(messageContent)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  // Seul le dernier mot du message peut déclencher (du plus long au plus court,
  // pour que les déclencheurs à plusieurs mots comme « ca va » gagnent).
  for (let size = Math.min(matchIndex.maxWordTokens, tokens.length); size >= 1; size -= 1) {
    const reaction = matchIndex.wordToReaction.get(tokens.slice(-size).join(" "));
    if (reaction) {
      return reaction;
    }
  }

  return null;
}
