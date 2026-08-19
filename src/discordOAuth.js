import { randomBytes } from "node:crypto";

import { getSetting, setSetting } from "./db.js";

// Connexion Discord OAuth2 pour le panneau web : après le login, chaque compte
// connecte son compte Discord pour ne voir que les serveurs dont il est membre.
// L'admin garde l'accès complet sans connexion Discord.

const DISCORD_API = "https://discord.com/api/v10";
const STATE_TTL_MS = 10 * 60 * 1000; // un état OAuth expire après 10 minutes

const oauthStates = new Map(); // state -> { username, expiresAt }

function clientId() {
  return process.env.DISCORD_CLIENT_ID ?? "";
}

function clientSecret() {
  return process.env.DISCORD_CLIENT_SECRET ?? "";
}

export function isOAuthConfigured() {
  return Boolean(clientId() && clientSecret());
}

function redirectUri() {
  const publicUrl = String(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  const base = publicUrl || `http://localhost:${process.env.PORT ?? 30000}`;
  return `${base}/api/oauth/callback`;
}

// Construit l'URL d'autorisation Discord (scope : identité + liste des serveurs).
export function buildAuthorizeUrl(username) {
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, { username, expiresAt: Date.now() + STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify guilds",
    state
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

// Consomme un état OAuth : retourne le username associé, ou null si inconnu/expiré.
export function consumeOAuthState(state) {
  const entry = oauthStates.get(state);

  if (!entry) {
    return null;
  }

  oauthStates.delete(state);

  if (Date.now() > entry.expiresAt) {
    return null;
  }

  return entry.username;
}

// Échange le code d'autorisation contre un token d'accès.
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri()
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error("Échange du code Discord refusé.");
  }

  const data = await response.json();
  return data.access_token;
}

async function discordGet(path, token) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

// Récupère l'identité Discord (id, pseudo) et la liste des serveurs du membre.
export async function fetchDiscordIdentity(token) {
  const me = await discordGet("/users/@me", token);
  const guilds = await discordGet("/users/@me/guilds", token);

  if (!me?.id) {
    throw new Error("Impossible de récupérer ton profil Discord.");
  }

  return {
    id: me.id,
    username: me.username,
    guilds: Array.isArray(guilds)
      ? guilds.map((guild) => ({ id: guild.id, name: guild.name }))
      : []
  };
}

// ---- Lien Discord persisté par utilisateur du panneau ----
function discordLinks() {
  return getSetting("discord_links") ?? {};
}

export function getDiscordLink(username) {
  return discordLinks()[username] ?? null;
}

export function setDiscordLink(username, identity) {
  const links = discordLinks();
  links[username] = { ...identity, linkedAt: Date.now() };
  setSetting("discord_links", links);
}

export function clearDiscordLink(username) {
  const links = discordLinks();

  if (links[username]) {
    delete links[username];
    setSetting("discord_links", links);
  }
}

// Serveurs Discord du membre, recoupés avec les serveurs où le bot est présent.
export function userGuilds(username, botGuilds) {
  const link = getDiscordLink(username);

  if (!link) {
    return [];
  }

  const memberIds = new Set(link.guilds.map((guild) => guild.id));
  return botGuilds.filter((guild) => memberIds.has(guild.id));
}
