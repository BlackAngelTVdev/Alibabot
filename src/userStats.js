import { getSetting, setSetting } from "./db.js";

function readStats() {
  const stored = getSetting("user_stats");
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function persist(stats) {
  setSetting("user_stats", stats);
}

function nextAnonId(stats) {
  const values = Object.values(stats);
  const max = values.reduce((memo, entry) => Math.max(memo, Number(entry?.anonId) || 0), 0);
  return max + 1;
}

// Enregistre un déclenchement : retourne l'entrée et si c'est le tout premier déclenchement.
export function recordUserTrigger(user) {
  const stats = readStats();
  let entry = stats[user.id];
  let first = false;

  if (!entry) {
    first = true;
    entry = {
      userId: user.id,
      username: user.username,
      count: 0,
      consent: "pending",
      anonId: nextAnonId(stats)
    };
    stats[user.id] = entry;
  }

  entry.count = (Number(entry.count) || 0) + 1;
  entry.username = user.username ?? entry.username;
  persist(stats);
  return { entry, first };
}

// Garantit qu'une entrée existe (sans compter un déclenchement) — utilisé par la commande de consentement.
export function ensureUserStat(user) {
  const stats = readStats();
  let entry = stats[user.id];

  if (!entry) {
    entry = {
      userId: user.id,
      username: user.username,
      count: 0,
      consent: "pending",
      anonId: nextAnonId(stats)
    };
    stats[user.id] = entry;
    persist(stats);
  } else if (user.username && user.username !== entry.username) {
    entry.username = user.username;
    persist(stats);
  }

  return entry;
}

export function getUserStat(userId) {
  return readStats()[userId] ?? null;
}

export function isPendingConsent(userId) {
  return getUserStat(userId)?.consent === "pending";
}

export function setUserConsent(userId, consent) {
  const stats = readStats();
  const entry = stats[userId];

  if (!entry) {
    return null;
  }

  entry.consent = consent;
  persist(stats);
  return entry;
}

function readServerStats() {
  const stored = getSetting("server_stats");
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

// Enregistre un déclenchement par serveur (classement « serveur le plus actif » du panneau).
export function recordServerTrigger(guild) {
  const stats = readServerStats();
  let entry = stats[guild.id];

  if (!entry) {
    entry = { guildId: guild.id, name: guild.name, count: 0 };
    stats[guild.id] = entry;
  }

  entry.count = (Number(entry.count) || 0) + 1;
  entry.name = guild.name ?? entry.name;
  setSetting("server_stats", stats);
  return entry;
}

// Classement des serveurs par nombre de déclenchements (décroissant).
export function serverLeaderboard() {
  const stats = readServerStats();
  return Object.values(stats)
    .map((entry) => ({ name: entry.name, count: Number(entry.count) || 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

// Remise à zéro du suivi : tout le monde sera re-demandé (avec boutons) au prochain déclenchement.
export function clearUserStats() {
  const stats = readStats();
  const count = Object.keys(stats).length;
  setSetting("user_stats", {});
  return count;
}

// Classement public : pseudo si consentement « oui », sinon « Anonyme #N ».
export function publicUserLeaderboard() {
  const stats = readStats();

  return Object.values(stats)
    .map((entry) => ({
      display: entry.consent === "yes" ? entry.username : `Anonyme #${entry.anonId}`,
      count: Number(entry.count) || 0
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}
