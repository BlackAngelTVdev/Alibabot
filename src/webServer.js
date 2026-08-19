import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getBotClient } from "./bot.js";
import {
  canAttemptLogin,
  checkCredentials,
  createSession,
  destroySession,
  getSessionUsername,
  isValidSession,
  readSessionToken,
  recordFailedLogin,
  resetLoginAttempts
} from "./auth.js";
import {
  addLog,
  countUsers,
  createUser,
  deleteUser,
  getLogs,
  getUser,
  initDb,
  listUsers,
  setSetting,
  updatePassword
} from "./db.js";
import { readBotPrefix, writeBotPrefix } from "./botConfig.js";
import { broadcastToGuilds, canBroadcast, listGuilds, markBroadcastUsed, nextBroadcastDelayMs } from "./broadcast.js";
import { dailyStats } from "./dailyStats.js";
import { createReaction, deleteReaction, readReactions, updateReaction } from "./reactions.js";
import { publicUserLeaderboard } from "./userStats.js";
import { readBotStatusConfig, writeBotStatusConfig } from "./statusConfig.js";

const port = Number(process.env.PORT ?? 30000);

// Version calculée depuis le contenu des fichiers du frontend : dès qu'un fichier change,
// l'URL des assets change → ni le navigateur ni les caches (Cloudflare, proxy) ne peuvent
// servir un vieux script. Version dans le chemin (et non en query string) : certains caches
// ignorent la query string, donc un simple « ?v=4 » ne suffirait pas.
function computeAssetVersion() {
  const files = ["../public/app.js", "../public/style.css", "../public/login.js", "../public/stats.js"];
  let hash = 0;

  for (const relative of files) {
    try {
      const content = readFileSync(fileURLToPath(new URL(relative, import.meta.url)));
      for (let index = 0; index < content.length; index += 1) {
        hash = (hash * 33 + content[index]) | 0;
      }
    } catch {
      // Fichier absent : on ignore.
    }
  }

  return "v" + Math.abs(hash).toString(36);
}

const ASSET_VERSION = computeAssetVersion();

const staticFiles = {
  [`/style-${ASSET_VERSION}.css`]: ["../public/style.css", "text/css; charset=utf-8"],
  [`/app-${ASSET_VERSION}.js`]: ["../public/app.js", "text/javascript; charset=utf-8"],
  [`/login-${ASSET_VERSION}.js`]: ["../public/login.js", "text/javascript; charset=utf-8"],
  [`/stats-${ASSET_VERSION}.js`]: ["../public/stats.js", "text/javascript; charset=utf-8"],
  // Anciens chemins conservés en alias (au cas où une vieille page en cache les référence encore).
  "/style.css": ["../public/style.css", "text/css; charset=utf-8"],
  "/app.js": ["../public/app.js", "text/javascript; charset=utf-8"],
  "/login.js": ["../public/login.js", "text/javascript; charset=utf-8"],
  "/stats.js": ["../public/stats.js", "text/javascript; charset=utf-8"],
  "/login": ["../public/login.html", "text/html; charset=utf-8"],
  "/stats": ["../public/stats.html", "text/html; charset=utf-8"],
  "/": ["../public/index.html", "text/html; charset=utf-8"]
};

function serveStaticFile(request, response, pathname) {
  const entry = staticFiles[pathname];

  if (!entry) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const [relativePath, contentType] = entry;
    const content = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)));
    const finalContent = contentType.startsWith("text/html")
      ? content.toString("utf8").replaceAll("@@ASSET_VERSION@@", ASSET_VERSION)
      : content;
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(finalContent);
  } catch {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Fichier introuvable." }));
  }
}

function handleLogin(request, response) {
  const ip = request.socket.remoteAddress ?? "unknown";

  if (!canAttemptLogin(ip)) {
    response.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Trop de tentatives. Réessaie dans quelques minutes." }));
    return;
  }

  let body = "";

  request.on("data", (chunk) => {
    body += chunk;
  });

  request.on("end", () => {
    try {
      const parsed = JSON.parse(body);

      if (!checkCredentials(parsed?.username, parsed?.password)) {
        recordFailedLogin(ip);
        addLog(String(parsed?.username ?? "?").trim() || ip, "échec de connexion", ip);
        response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Identifiants incorrects." }));
        return;
      }

      resetLoginAttempts(ip);
      const username = String(parsed.username).trim();
      const sessionToken = createSession(username);
      addLog(username, "connexion", ip);

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `authToken=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`
      });
      response.end(JSON.stringify({ ok: true }));
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Requête invalide." }));
    }
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Requête invalide."));
      }
    });

    request.on("error", reject);
  });
}

export async function startWebServer() {
  await initDb();

  if (countUsers() === 0) {
    console.error("Aucun utilisateur dans la base. Ajoute ADMIN_USERNAME et ADMIN_PASSWORD dans .env pour créer le premier compte, puis relance.");
    process.exit(1);
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    if (request.method === "POST" && pathname === "/api/login") {
      handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      const sessionToken = readSessionToken(request.headers.cookie);

      if (sessionToken) {
        addLog(getSessionUsername(sessionToken) ?? "?", "déconnexion");
        destroySession(sessionToken);
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    // ---- Routes publiques (sans session) ----
    if (request.method === "GET" && (pathname === "/favicon" || pathname === "/favicon.ico")) {
      // Favicon = l'avatar actuel du bot. Redirection vers le CDN Discord : l'URL change
      // quand l'avatar change, donc le navigateur recharge toujours la bonne image.
      const client = getBotClient();
      const avatarUrl = client?.user?.displayAvatarURL({ extension: "png", size: 64 });

      if (!avatarUrl) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Pas d'avatar disponible." }));
        return;
      }

      response.writeHead(302, {
        Location: avatarUrl,
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && pathname === "/login") {
      serveStaticFile(request, response, "/login");
      return;
    }

    if (request.method === "GET" && pathname in staticFiles && pathname !== "/") {
      serveStaticFile(request, response, pathname);
      return;
    }

    if (request.method === "GET" && pathname === "/api/public-stats") {
      const triggers = readReactions()
        .map((reaction) => ({
          trigger: reaction.trigger,
          response: reaction.response,
          count: reaction.count ?? 0
        }))
        .sort((a, b) => b.count - a.count);

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify({
        triggers,
        users: publicUserLeaderboard(),
        daily: dailyStats()
      }));
      return;
    }

    if (request.method === "GET" && pathname === "/api/bot-info") {
      const client = getBotClient();

      if (!client?.user) {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ username: null, avatarURL: null, prefix: readBotPrefix() }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        username: client.user.username,
        avatarURL: client.user.displayAvatarURL(),
        prefix: readBotPrefix()
      }));
      return;
    }

    // ---- Authentification ----
    const sessionToken = readSessionToken(request.headers.cookie);

    if (!isValidSession(sessionToken)) {
      if (pathname.startsWith("/api/")) {
        response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Non authentifié." }));
        return;
      }

      response.writeHead(302, { Location: "/login" });
      response.end();
      return;
    }

    // ---- Gestion des utilisateurs (réservée à l'admin) ----
    const currentUsername = getSessionUsername(sessionToken);
    const currentUser = getUser(currentUsername);

    if (request.method === "GET" && pathname === "/api/users") {
      if (!currentUser?.isAdmin) {
        // Sans les droits admin : on ne renvoie que son propre compte (pour changer son mot de passe).
        const self = getUser(currentUsername);
        const { passwordHash, ...safeUser } = self ?? {};
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ users: self ? [safeUser] : [], currentUser: currentUsername }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ users: listUsers(), currentUser: currentUsername }));
      return;
    }

    if (request.method === "POST" && pathname === "/api/users") {
      if (!currentUser?.isAdmin) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Réservé à l'administrateur." }));
        return;
      }

      readJsonBody(request)
        .then((parsed) => {
          const { passwordHash, ...safeUser } = createUser(parsed?.username, parsed?.password);
          addLog(currentUsername, "compte créé", safeUser.username);
          response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ user: safeUser }));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    const passwordMatch = pathname.match(/^\/api\/users\/([^/]+)\/password$/);

    if (request.method === "DELETE" && userMatch) {
      const username = decodeURIComponent(userMatch[1]);

      if (!currentUser?.isAdmin) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Réservé à l'administrateur." }));
        return;
      }

      try {
        if (username === currentUsername) {
          throw new Error("Impossible de supprimer ton propre compte.");
        }

        deleteUser(username);
        addLog(currentUsername, "compte supprimé", username);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (request.method === "POST" && passwordMatch) {
      const username = decodeURIComponent(passwordMatch[1]);

      if (!currentUser?.isAdmin && username !== currentUsername) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Réservé à l'administrateur." }));
        return;
      }

      readJsonBody(request)
        .then((parsed) => {
          updatePassword(username, parsed?.password);
          addLog(currentUsername, "mot de passe modifié", username);
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: true }));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    // ---- Personnalisation du bot ----
    if (request.method === "POST" && pathname === "/api/avatar") {
      readJsonBody(request)
        .then(async (parsed) => {
          try {
            const client = getBotClient();

            if (!client?.user) {
              throw new Error("Le bot Discord n'est pas connecté.");
            }

            const image = String(parsed?.image ?? "");
            if (!image) {
              throw new Error("Aucune image reçue.");
            }

            const base64 = image.includes("base64,") ? image.split("base64,")[1] : image;
            const buffer = Buffer.from(base64, "base64");

            if (buffer.length === 0) {
              throw new Error("Image invalide.");
            }

            if (buffer.length > 5 * 1024 * 1024) {
              throw new Error("Image trop lourde (5 Mo maximum).");
            }

            await client.user.setAvatar(buffer);
            addLog(currentUsername, "photo de profil changée");
            response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: true }));
          } catch (error) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: error.message }));
          }
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    if (request.method === "POST" && pathname === "/api/bot-name") {
      readJsonBody(request)
        .then(async (parsed) => {
          try {
            const client = getBotClient();

            if (!client?.user) {
              throw new Error("Le bot Discord n'est pas connecté.");
            }

            const name = String(parsed?.name ?? "").trim();
            if (name.length < 2 || name.length > 32) {
              throw new Error("Le pseudo doit faire entre 2 et 32 caractères.");
            }

            await client.user.setUsername(name);
            addLog(currentUsername, "pseudo changé", name);
            response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: true, username: name }));
          } catch (error) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: error.message }));
          }
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    if (request.method === "POST" && pathname === "/api/bot-prefix") {
      readJsonBody(request)
        .then((parsed) => {
          const prefix = writeBotPrefix(parsed?.prefix);
          addLog(currentUsername, "préfixe modifié", prefix);
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: true, prefix }));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    // ---- Broadcast (ouvert à tous les comptes connectés ; les non-admins sont limités à 1 envoi/jour) ----
    if (request.method === "GET" && pathname === "/api/guilds") {
      listGuilds()
        .then((guilds) => {
          response.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          });
          response.end(JSON.stringify({ guilds }));
        })
        .catch((error) => {
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    if (request.method === "POST" && pathname === "/api/broadcast") {
      const isAdmin = Boolean(currentUser?.isAdmin);

      readJsonBody(request)
        .then(async (parsed) => {
          // Les comptes normaux sont limités à un envoi par jour ; les admins, non.
          if (!isAdmin && !canBroadcast(currentUsername)) {
            const hours = Math.ceil(nextBroadcastDelayMs(currentUsername) / 3_600_000);
            throw new Error(`Tu as déjà envoyé un broadcast aujourd'hui. Réessaie dans ${hours} h.`);
          }

          const result = await broadcastToGuilds(parsed, parsed?.guildId);

          // On ne consomme le quota que si au moins un serveur a réellement reçu le message.
          if (!isAdmin && result.sent > 0) {
            markBroadcastUsed(currentUsername);
          }

          addLog(currentUsername, "broadcast", `${result.sent}/${result.total} serveurs`);
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(result));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    if (request.method === "GET" && pathname === "/api/logs") {
      if (!currentUser?.isAdmin) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Réservé à l'administrateur." }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ logs: getLogs(100) }));
      return;
    }

    // ---- Page et API du bot ----
    if (request.method === "GET" && pathname === "/") {
      serveStaticFile(request, response, "/");
      return;
    }

    // ---- Réactions (mots déclencheurs + réponses) ----
    if (request.method === "GET" && pathname === "/api/reactions") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ reactions: readReactions() }));
      return;
    }

    if (request.method === "POST" && pathname === "/api/reactions") {
      readJsonBody(request)
        .then((parsed) => {
          const reaction = createReaction(parsed?.trigger, parsed?.response);
          addLog(currentUsername, "réaction créée", `${reaction.trigger} → ${reaction.response}`);
          response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ reaction }));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    const reactionMatch = pathname.match(/^\/api\/reactions\/([^/]+)$/);

    if (request.method === "PUT" && reactionMatch) {
      const trigger = decodeURIComponent(reactionMatch[1]);

      readJsonBody(request)
        .then((parsed) => {
          const reaction = updateReaction(trigger, parsed);
          addLog(currentUsername, "réaction modifiée", `${reaction.trigger} → ${reaction.response}`);
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ reaction }));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    if (request.method === "DELETE" && reactionMatch) {
      const trigger = decodeURIComponent(reactionMatch[1]);

      try {
        deleteReaction(trigger);
        addLog(currentUsername, "réaction supprimée", trigger);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (request.method === "GET" && pathname === "/api/bot-status") {
      const status = readBotStatusConfig();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(status));
      return;
    }

    if (request.method === "POST" && pathname === "/api/bot-status") {
      readJsonBody(request)
        .then((parsed) => {
          const savedStatus = writeBotStatusConfig(parsed);
          addLog(currentUsername, "statuts modifiés", `${savedStatus.statuses.length} statuts`);
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(savedStatus));
        })
        .catch((error) => {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }));
        });
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    console.log(`Interface web disponible sur http://localhost:${port}`);
  });

  return server;
}
