import { randomBytes } from "node:crypto";

import {
  createSessionRow,
  deleteExpiredSessions,
  deleteSessionRow,
  getSessionRow,
  verifyCredentials
} from "./db.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 heures
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map(); // ip -> { count, windowStart, lockedUntil }

export function checkCredentials(usernameAttempt, passwordAttempt) {
  return verifyCredentials(usernameAttempt, passwordAttempt);
}

export function createSession(username) {
  deleteExpiredSessions();

  const token = randomBytes(32).toString("hex");
  createSessionRow(token, username, Date.now() + SESSION_TTL_MS);
  return token;
}

export function getSessionUsername(token) {
  return getSessionRow(token)?.username ?? null;
}

export function isValidSession(token) {
  if (!token) {
    return false;
  }

  const session = getSessionRow(token);

  if (!session) {
    return false;
  }

  if (Date.now() > session.expiresAt) {
    deleteSessionRow(token);
    return false;
  }

  return true;
}

export function destroySession(token) {
  if (token) {
    deleteSessionRow(token);
  }
}

export function canAttemptLogin(ip) {
  const entry = loginAttempts.get(ip);

  if (!entry) {
    return true;
  }

  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return false;
  }

  return entry.count < MAX_LOGIN_ATTEMPTS;
}

export function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) ?? { count: 0, windowStart: now, lockedUntil: 0 };

  if (now - entry.windowStart > LOCK_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
    entry.lockedUntil = 0;
  }

  entry.count += 1;

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_WINDOW_MS;
  }

  loginAttempts.set(ip, entry);
}

export function resetLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

export function readSessionToken(cookieHeader) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of String(cookieHeader).split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "authToken") {
      return rest.join("=");
    }
  }

  return null;
}
