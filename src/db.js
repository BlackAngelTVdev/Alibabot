import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import initSqlJs from "sql.js";

const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL("../users.db", import.meta.url));
const scryptKeyLength = 64;

let database = null;

// Invalidation de caches dépendant d'une clé de settings (ex. : index des réactions).
const settingWatchers = new Set();

export function watchSetting(key, onChanged) {
  settingWatchers.add({ key, onChanged });
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, scryptKeyLength).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) {
    return false;
  }

  const candidate = scryptSync(password, salt, scryptKeyLength);
  const expected = Buffer.from(hash, "hex");

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function normalizeUsername(username) {
  return String(username ?? "").trim();
}

function assertValidCredentials(username, password) {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Le nom d'utilisateur doit faire 3 à 32 caractères (lettres, chiffres, . _ -).");
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Le mot de passe doit faire au moins 8 caractères.");
  }
}

function persistDatabase() {
  const exported = Buffer.from(database.export());
  writeFileSync(dbPath, exported);
}

export async function initDb() {
  const SQL = await initSqlJs();

  try {
    database = new SQL.Database(readFileSync(dbPath));
  } catch {
    database = new SQL.Database();
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT ''
    );
  `);

  migrateLegacyFiles();

  if (countUsers() === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const username = normalizeUsername(process.env.ADMIN_USERNAME);
    const password = process.env.ADMIN_PASSWORD;

    try {
      assertValidCredentials(username, password);
      database.run("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)", [username, hashPassword(password)]);
      persistDatabase();
    } catch {
      // Le seed échoue si les variables d'environnement sont invalides : on laisse la base vide.
    }
  }

  persistDatabase();
}

function migrateLegacyFiles() {
  if (getSetting("quoi_variants") === undefined) {
    try {
      const legacyContent = JSON.parse(readFileSync(fileURLToPath(new URL("../quoi-variants.json", import.meta.url)), "utf8"));
      if (Array.isArray(legacyContent)) {
        setSetting("quoi_variants", legacyContent);
      }
    } catch {
      // Fichier absent ou illisible : rien à migrer.
    }
  }

  if (getSetting("bot_status") === undefined) {
    try {
      const legacyContent = JSON.parse(readFileSync(fileURLToPath(new URL("../bot-status.json", import.meta.url)), "utf8"));
      setSetting("bot_status", legacyContent);
    } catch {
      // Fichier absent ou illisible : rien à migrer.
    }
  }

  if (getSetting("reactions") === undefined) {
    const legacyVariants = getSetting("quoi_variants");
    const variants = Array.isArray(legacyVariants) ? legacyVariants : [];

    // Ancien comportement : le bot répond « feur » aux variantes de « quoi ».
    setSetting("reactions", [{ trigger: "quoi", response: "feur", variants }]);
  }
}

export function getSetting(key) {
  if (!database) {
    return undefined;
  }

  const statement = database.prepare("SELECT value FROM settings WHERE key = ?");
  statement.bind([key]);

  let value;
  if (statement.step()) {
    value = statement.get()[0];
  }
  statement.free();

  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function setSetting(key, value) {
  if (!database) {
    throw new Error("Base non initialisée.");
  }

  database.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
  persistDatabase();

  for (const watcher of settingWatchers) {
    if (watcher.key === key) {
      watcher.onChanged();
    }
  }
}

export function createSessionRow(token, username, expiresAt) {
  if (!database) {
    throw new Error("Base non initialisée.");
  }

  database.run("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)", [token, username, expiresAt]);
  persistDatabase();
}

export function getSessionRow(token) {
  if (!database) {
    return null;
  }

  const statement = database.prepare("SELECT username, expires_at FROM sessions WHERE token = ?");
  statement.bind([token]);

  if (statement.step()) {
    const [username, expiresAt] = statement.get();
    statement.free();
    return { username, expiresAt };
  }

  statement.free();
  return null;
}

export function deleteSessionRow(token) {
  if (!database) {
    return;
  }

  database.run("DELETE FROM sessions WHERE token = ?", [token]);
  persistDatabase();
}

export function deleteExpiredSessions() {
  if (!database) {
    return;
  }

  database.run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  persistDatabase();
}

// Maintenance nocturne : met à jour les statistiques du planificateur SQLite (ANALYZE)
// et compacte la base (VACUUM), puis réécrit le fichier. À lancer quand le bot est peu utilisé.
export function runDbMaintenance() {
  if (!database) {
    return false;
  }

  database.run("ANALYZE");
  database.run("VACUUM");
  persistDatabase();
  return true;
}

const LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const LOG_MAX_ROWS = 1500; // garde-fou : jamais plus de 1500 entrées, même très actif

export function addLog(username, action, details = "") {
  if (!database) {
    return;
  }

  database.run("INSERT INTO logs (timestamp, username, action, details) VALUES (?, ?, ?, ?)", [Date.now(), username, action, details]);
  database.run("DELETE FROM logs WHERE timestamp < ?", [Date.now() - LOG_RETENTION_MS]);
  database.run("DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)", [LOG_MAX_ROWS]);
  persistDatabase();
}

export function getLogs(limit = 100) {
  if (!database) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = database.exec(`SELECT id, timestamp, username, action, details FROM logs ORDER BY id DESC LIMIT ${safeLimit}`);

  return (result[0]?.values ?? []).map(([id, timestamp, username, action, details]) => ({
    id,
    timestamp,
    username,
    action,
    details
  }));
}

export function countUsers() {
  const result = database.exec("SELECT COUNT(*) FROM users");
  return Number(result[0]?.values?.[0]?.[0] ?? 0);
}

export function listUsers() {
  const result = database.exec("SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE");
  return (result[0]?.values ?? []).map(([id, username, isAdmin, createdAt]) => ({
    id,
    username,
    isAdmin: isAdmin === 1,
    createdAt
  }));
}

export function getUser(username) {
  const statement = database.prepare("SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?");
  statement.bind([username]);

  if (statement.step()) {
    const [id, storedUsername, passwordHash, isAdmin, createdAt] = statement.get();
    statement.free();
    return { id, username: storedUsername, passwordHash, isAdmin: isAdmin === 1, createdAt };
  }

  statement.free();
  return null;
}

export function createUser(username, password, isAdmin = false) {
  const normalizedUsername = normalizeUsername(username);
  assertValidCredentials(normalizedUsername, password);

  try {
    database.run("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)", [normalizedUsername, hashPassword(password), isAdmin ? 1 : 0]);
  } catch {
    throw new Error(`L'utilisateur "${normalizedUsername}" existe déjà.`);
  }

  persistDatabase();
  return getUser(normalizedUsername);
}

export function deleteUser(username) {
  const normalizedUsername = normalizeUsername(username);

  if (!getUser(normalizedUsername)) {
    throw new Error(`L'utilisateur "${normalizedUsername}" n'existe pas.`);
  }

  if (countUsers() <= 1) {
    throw new Error("Impossible de supprimer le dernier utilisateur.");
  }

  database.run("DELETE FROM users WHERE username = ?", [normalizedUsername]);
  persistDatabase();
}

export function updatePassword(username, password) {
  const normalizedUsername = normalizeUsername(username);

  if (!getUser(normalizedUsername)) {
    throw new Error(`L'utilisateur "${normalizedUsername}" n'existe pas.`);
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Le mot de passe doit faire au moins 8 caractères.");
  }

  database.run("UPDATE users SET password_hash = ? WHERE username = ?", [hashPassword(password), normalizedUsername]);
  persistDatabase();
}

export function verifyCredentials(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const user = getUser(normalizedUsername);

  if (!user) {
    return false;
  }

  return verifyPassword(password, user.passwordHash);
}
