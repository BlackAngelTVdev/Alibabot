import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PermissionFlagsBits } from "discord.js";
import { getBotClient } from "./bot.js";
import { getSetting, setSetting } from "./db.js";

// Screen joint au MP du propriétaire : montre comment placer les rôles tout en haut.
const ROLE_SETUP_IMAGE = fileURLToPath(new URL("../public/role-setup.png", import.meta.url));

// Rôle « Déclencheur du Jour » : la personne qui a le plus déclenché le bot
// aujourd'hui, sur chaque serveur, porte le rôle (créé automatiquement, couleur
// or, affiché à part → pseudo coloré). Le rôle suit EN DIRECT le leader du jour :
// si quelqu'un dépasse, le rôle change de main. Tout est en mémoire : au
// redémarrage (ou au changement de jour), le rôle est retiré et on repart de zéro.

export const CHAMPION_ROLE_NAME = "👑 Déclencheur du Jour";
const CHAMPION_ROLE_COLOR = 0xf1c40f; // or bien visible
const LOOP_INTERVAL_MS = 60_000;
const ENABLED_SETTING = "champion_role_enabled";
const SERVERS_SETTING = "champion_role_servers"; // guildId -> boolean (par serveur)

let currentDayKey = null;
let day = null; // { key, guilds: Map<guildId, Map<userId, { userId, username, count }>> }
let holders = new Map(); // guildId → userId qui porte actuellement le rôle
let lastDayKey = null; // dernière journée déjà finalisée (rôles retirés)
let loopTimer = null;

function dayKeyOf(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNumber = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNumber}`;
}

function ensureDay(key) {
  if (currentDayKey !== key) {
    if (currentDayKey !== null) {
      // La journée précédente se termine : on retire les rôles et on repart de zéro.
      finalizeEndedDay();
    }
    currentDayKey = key;
    day = { key, guilds: new Map() };
  }
  return day;
}

// Enregistre un déclenchement pour aujourd'hui (ou la date fournie, pour les tests),
// compté par serveur et par utilisateur.
export function recordChampionTrigger(userId, username, guildId, date = new Date()) {
  const current = ensureDay(dayKeyOf(date));
  const guildMap = current.guilds.get(guildId) ?? new Map();
  const entry = guildMap.get(userId) ?? { userId, username, count: 0 };
  entry.count += 1;
  entry.username = username ?? entry.username;
  guildMap.set(userId, entry);
  current.guilds.set(guildId, guildMap);
  return entry;
}

// Vainqueurs de la journée courante, un par serveur (tri décroissant).
export function dayChampions() {
  if (!day) {
    return [];
  }

  const champions = [];

  for (const [guildId, users] of day.guilds) {
    const [winner] = [...users.values()].sort((a, b) => b.count - a.count);

    if (winner) {
      champions.push({ guildId, ...winner });
    }
  }

  return champions;
}

// Le système peut être coupé globalement par l'admin (réglage persisté, actif par défaut),
// et par serveur (par défaut chaque serveur est actif sauf si désactivé).
export function isChampionRoleEnabled(guildId = null) {
  if (getSetting(ENABLED_SETTING) === false) {
    return false;
  }

  if (guildId) {
    const servers = getSetting(SERVERS_SETTING) ?? {};
    return servers[guildId] !== false;
  }

  return true;
}

export function setChampionRoleEnabled(enabled) {
  setSetting(ENABLED_SETTING, Boolean(enabled));
  return Boolean(enabled);
}

// Active/désactive le système sur un serveur précis.
export function setChampionRoleEnabledForGuild(guildId, enabled) {
  const servers = getSetting(SERVERS_SETTING) ?? {};
  servers[guildId] = Boolean(enabled);
  setSetting(SERVERS_SETTING, servers);
  return Boolean(enabled);
}

// État par serveur (guildId -> boolean) pour l'affichage du panneau.
export function championRoleGuilds() {
  return getSetting(SERVERS_SETTING) ?? {};
}

// Remet à zéro le suivi d'un seul serveur (utilisé quand on désactive le rôle dessus).
export function resetChampionTrackingForGuild(guildId) {
  day?.guilds?.delete(guildId);
  holders.delete(guildId);
}

// Appelé à chaque déclenchement : si le leader du serveur a changé, le rôle change de main.
export async function refreshGuildChampion(guild, date = new Date()) {
  if (!isChampionRoleEnabled(guild.id)) {
    return null;
  }

  const current = ensureDay(dayKeyOf(date));
  const guildMap = current.guilds.get(guild.id);

  if (!guildMap || guildMap.size === 0) {
    return null;
  }

  const [winner] = [...guildMap.values()].sort((a, b) => b.count - a.count);

  if (!winner) {
    return null;
  }

  if (holders.get(guild.id) === winner.userId) {
    return { guild: guild.name, ok: true, unchanged: true };
  }

  return crownGuildChampion(guild, winner);
}

// Remise à zéro complète (appelée au démarrage du bot).
export function resetChampionTracking() {
  currentDayKey = null;
  day = null;
  holders.clear();
}

// Fin de journée : on retire le rôle au champion sortant de chaque serveur.
function finalizeEndedDay() {
  if (!day || lastDayKey === day.key) {
    return;
  }

  lastDayKey = day.key;
  const ended = day;
  const holdersSnapshot = new Map(holders);

  retireEndedDayRoles(ended, holdersSnapshot).catch((error) => console.error("Fin du Déclencheur du Jour :", error.message));
}

async function retireEndedDayRoles(ended, holdersSnapshot) {
  const client = getBotClient();

  if (!client?.user) {
    return;
  }

  for (const [guildId, holderId] of holdersSnapshot) {
    if (!ended.guilds.has(guildId)) {
      continue;
    }

    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      continue;
    }

    try {
      const role = guild.roles.cache.find((candidate) => candidate.name === CHAMPION_ROLE_NAME);
      const holder = await guild.members.fetch(holderId);

      if (role && holder.roles.cache.has(role.id)) {
        await holder.roles.remove(role);
      }
    } catch {
      // Membre injoignable ou rôle déjà retiré : on continue.
    }

    holders.delete(guildId);
  }
}

// Sécurité : même sans déclenchement pile à minuit, on finalise la journée terminée.
export function startDailyChampionLoop() {
  if (loopTimer) {
    return;
  }

  loopTimer = setInterval(() => {
    if (day && day.key !== dayKeyOf(new Date()) && lastDayKey !== day.key) {
      finalizeEndedDay();
      resetChampionTracking();
    }
  }, LOOP_INTERVAL_MS);
}

// Crée le rôle « Déclencheur du Jour » sur un serveur s'il n'existe pas, le positionne
// bien (juste sous le rôle le plus haut du bot) et prévient le propriétaire en MP si
// une action humaine est nécessaire (permission ou hiérarchie).
// Retourne le rôle, ou null si impossible (ou si le serveur est désactivé).
export async function ensureChampionRole(guild) {
  if (!isChampionRoleEnabled(guild.id)) {
    return null;
  }

  const client = getBotClient();
  const me = guild.members.me ?? guild.members.cache.get(client?.user?.id);

  if (!me) {
    return null;
  }

  const botHighest = me.roles.highest;
  let role;

  try {
    role = guild.roles.cache.find((candidate) => candidate.name === CHAMPION_ROLE_NAME);

    if (!role) {
      role = await guild.roles.create({
        name: CHAMPION_ROLE_NAME,
        colors: [CHAMPION_ROLE_COLOR],
        hoist: true,
        mentionable: false,
        reason: "Récompense quotidienne du Déclencheur du Jour"
      });
    }
  } catch {
    await dmGuildOwner(
      guild,
      `Salut ! 👋 Je n'ai pas réussi à créer le rôle « ${CHAMPION_ROLE_NAME} » sur **${guild.name}**. Pour que ça marche : Paramètres du serveur → Rôles, donne-moi la permission **« Gérer les rôles »** (et monte mon rôle tout en haut). C'est montré sur le screen ci-joint 🙏`
    );
    return null;
  }

  // On place le rôle juste sous le rôle le plus haut du bot pour qu'il soit bien visible.
  if (botHighest && role.position < botHighest.position - 1) {
    try {
      await role.setPosition(botHighest.position - 1);
    } catch {
      // Position non modifiable : on continue, l'attribution marche quand même.
    }
  }

  // Si le rôle est au-dessus du rôle le plus haut du bot, le bot ne peut pas le gérer :
  // il faut une action humaine pour le déplacer plus haut (pseudo coloré, visible).
  if (!botHighest || role.position >= botHighest.position) {
    await dmGuildOwner(
      guild,
      `Salut ! 👋 Pour que le rôle « ${CHAMPION_ROLE_NAME} » de **${guild.name}** fonctionne (pseudo coloré, bien visible), il faut mettre **les 2 rôles tout en haut** de la liste : le rôle du bot **et** le rôle ${CHAMPION_ROLE_NAME}, l'un juste sous l'autre. Paramètres du serveur → Rôles, puis glisse-les en haut (comme sur le screen ci-joint). Merci ! 🙏`
    );
  }

  return role;
}

// Crée le rôle sur tous les serveurs où le bot est présent (appelé au démarrage
// et quand le bot rejoint un nouveau serveur). Ne fait rien si le système est désactivé.
export async function ensureChampionRoleEverywhere() {
  if (!isChampionRoleEnabled()) {
    return [];
  }

  const client = getBotClient();

  if (!client?.user) {
    return [];
  }

  const results = [];

  for (const guild of client.guilds.cache.values()) {
    if (!isChampionRoleEnabled(guild.id)) {
      results.push({ guild: guild.name, ok: false, disabled: true });
      continue;
    }

    try {
      const role = await ensureChampionRole(guild);
      results.push({ guild: guild.name, ok: Boolean(role) });
    } catch {
      results.push({ guild: guild.name, ok: false });
    }
  }

  return results;
}

// Donne le rôle au leader d'un serveur, en le créant si besoin, et prévient
// le propriétaire en MP quand une action humaine est nécessaire (hiérarchie des rôles).
export async function crownGuildChampion(guild, champion) {
  const role = await ensureChampionRole(guild);

  if (!role) {
    return { guild: guild.name, ok: false, reason: "création du rôle impossible" };
  }

  const previous = holders.get(guild.id);

  // On retire le rôle à l'ancien champion (s'il y en a un et que ce n'est pas le même).
  if (previous && previous !== champion.userId) {
    try {
      const prevMember = await guild.members.fetch(previous);

      if (prevMember.roles.cache.has(role.id)) {
        await prevMember.roles.remove(role);
      }
    } catch {
      // Ancien champion injoignable : on continue.
    }
  }

  if (previous === champion.userId) {
    return { guild: guild.name, ok: true, unchanged: true, winner: champion.userId, count: champion.count };
  }

  try {
    const winnerMember = await guild.members.fetch(champion.userId);
    await winnerMember.roles.add(role);
    holders.set(guild.id, champion.userId);
    return { guild: guild.name, ok: true, winner: winnerMember.user?.username ?? champion.username, count: champion.count };
  } catch (error) {
    await dmGuildOwner(
      guild,
      `Salut ! 👋 Je n'ai pas pu donner le rôle « ${CHAMPION_ROLE_NAME} » à <@${champion.userId}> sur **${guild.name}**. Vérifie que **les 2 rôles** (le mien et ${CHAMPION_ROLE_NAME}) sont **tout en haut** de la hiérarchie, au-dessus des membres (Paramètres du serveur → Rôles, comme sur le screen ci-joint). Merci ! 🙏`
    );
    return { guild: guild.name, ok: false, reason: error.message };
  }
}

// Retire le rôle à tous ceux qui l'ont sur un serveur précis.
// Retourne le nombre de membres dé-rôlés.
export async function removeChampionRoleOnGuild(guild) {
  const client = getBotClient();

  if (!client?.user) {
    return 0;
  }

  const role = guild.roles.cache.find((candidate) => candidate.name === CHAMPION_ROLE_NAME);

  if (!role) {
    return 0;
  }

  try {
    const members = await guild.members.fetch();
    const holdersWithRole = members.filter((member) => member.roles.cache.has(role.id));

    for (const member of holdersWithRole.values()) {
      await member.roles.remove(role).catch(() => {});
    }

    return holdersWithRole.size;
  } catch {
    return 0;
  }
}

// Au redémarrage : retire le rôle à tous ceux qui l'ont, sur tous les serveurs,
// pour que le comptage reparte de zéro.
export async function removeChampionRoleEverywhere() {
  const client = getBotClient();

  if (!client?.user) {
    return [];
  }

  const results = [];

  for (const guild of client.guilds.cache.values()) {
    const removed = await removeChampionRoleOnGuild(guild);
    results.push({ guildId: guild.id, removed });
  }

  return results;
}

// Envoie un MP au propriétaire du serveur (ou à un admin) quand une action manuelle est requise,
// avec le screen qui montre comment placer les rôles tout en haut.
async function dmGuildOwner(guild, message) {
  try {
    let target = null;

    try {
      target = await guild.fetchOwner();
    } catch {
      target = null;
    }

    if (!target) {
      const members = await guild.members.fetch();
      target = members.find((member) => member.permissions.has(PermissionFlagsBits.Administrator)) ?? null;
    }

    if (target) {
      const payload = { content: message };

      if (existsSync(ROLE_SETUP_IMAGE)) {
        payload.files = [{ attachment: ROLE_SETUP_IMAGE, name: "role-setup.png" }];
      }

      await target.send(payload);
    }
  } catch {
    // MP fermés : on laisse tomber silencieusement.
  }
}
