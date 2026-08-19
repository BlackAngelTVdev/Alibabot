import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { getBotClient } from "./bot.js";
import { getSetting, setSetting } from "./db.js";

// Les comptes normaux peuvent envoyer au plus un broadcast par jour (les admins, non limités).
const DAILY_LIMIT_MS = 24 * 60 * 60 * 1000;

function lastBroadcastAt(username) {
  const map = getSetting("broadcast_last") ?? {};
  return Number(map[username]) || 0;
}

export function canBroadcast(username) {
  return Date.now() - lastBroadcastAt(username) >= DAILY_LIMIT_MS;
}

export function nextBroadcastDelayMs(username) {
  return Math.max(0, DAILY_LIMIT_MS - (Date.now() - lastBroadcastAt(username)));
}

export function markBroadcastUsed(username) {
  const map = getSetting("broadcast_last") ?? {};
  map[username] = Date.now();
  setSetting("broadcast_last", map);
}

const MAX_FIELDS = 25;
const MAX_BUTTONS = 25;
const MAX_BUTTONS_PER_ROW = 5;
const DEFAULT_COLOR = 0x38bdf8;

function parseColor(raw) {
  if (typeof raw !== "string") {
    return DEFAULT_COLOR;
  }

  let value = raw.trim();

  if (value.startsWith("#")) {
    value = value.slice(1);
  } else if (value.startsWith("0x")) {
    value = value.slice(2);
  }

  const parsed = parseInt(value, 16);

  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_COLOR;
  }

  return parsed & 0xffffff;
}

function parseButtonStyle(style) {
  switch (String(style ?? "").toLowerCase()) {
    case "success":
      return ButtonStyle.Success;
    case "danger":
      return ButtonStyle.Danger;
    case "secondary":
      return ButtonStyle.Secondary;
    case "link":
      return ButtonStyle.Link;
    default:
      return ButtonStyle.Primary;
  }
}

// Construit la charge utile Discord (embed + boutons) à partir de la spec du panneau.
export function buildBroadcastPayload(spec = {}) {
  const embed = new EmbedBuilder();
  embed.setColor(parseColor(spec.color));

  const title = String(spec.title ?? "").trim();
  const description = String(spec.description ?? "").trim();

  if (title) {
    embed.setTitle(title.slice(0, 256));
  }

  if (description) {
    embed.setDescription(description.slice(0, 4096));
  }

  const authorName = String(spec.authorName ?? "").trim();
  if (authorName) {
    embed.setAuthor({ name: authorName.slice(0, 256), iconURL: String(spec.authorIcon ?? "").trim() || undefined });
  }

  const footer = String(spec.footer ?? "").trim();
  if (footer) {
    embed.setFooter({ text: footer.slice(0, 2048) });
  }

  const thumbnail = String(spec.thumbnail ?? "").trim();
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  const image = String(spec.image ?? "").trim();
  if (image) {
    embed.setImage(image);
  }

  if (!title && !description && !image && !authorName) {
    throw new Error("Renseigne au moins un titre, une description ou une image.");
  }

  const fields = Array.isArray(spec.fields) ? spec.fields.slice(0, MAX_FIELDS) : [];
  for (const field of fields) {
    const name = String(field?.name ?? "").trim();
    const value = String(field?.value ?? "").trim();

    if (name && value) {
      embed.addFields({
        name: name.slice(0, 256),
        value: value.slice(0, 1024),
        inline: Boolean(field.inline)
      });
    }
  }

  const payload = { embeds: [embed] };

  const buttons = (Array.isArray(spec.buttons) ? spec.buttons : [])
    .slice(0, MAX_BUTTONS)
    .map((button, index) => {
      const label = String(button?.label ?? "").trim().slice(0, 80);
      if (!label) {
        return null;
      }

      const isLink = String(button?.style ?? "") === "link";
      const built = new ButtonBuilder().setLabel(label).setStyle(parseButtonStyle(button?.style));

      if (isLink) {
        const url = String(button?.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new Error(`Le bouton « ${label} » doit avoir une URL valide (https://…).`);
        }
        built.setURL(url);
      } else {
        built.setCustomId(`bc:${label.slice(0, 80)}`);
      }

      return built;
    })
    .filter(Boolean);

  if (buttons.length > 0) {
    const rows = [];
    for (let index = 0; index < buttons.length; index += MAX_BUTTONS_PER_ROW) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + MAX_BUTTONS_PER_ROW)));
    }
    payload.components = rows;
  }

  return payload;
}

async function findTargetChannel(guild) {
  const client = getBotClient();

  if (!client?.user) {
    return null;
  }

  let channels;
  try {
    channels = await guild.channels.fetch();
  } catch {
    return null;
  }

  const canSend = (channel) => channel.permissionsFor(client.user)?.has(PermissionFlagsBits.SendMessages) ?? false;
  const textChannels = channels.filter((channel) => channel.type === ChannelType.GuildText && canSend(channel));

  if (guild.systemChannel && canSend(guild.systemChannel)) {
    return guild.systemChannel;
  }

  const named = textChannels.find((channel) => /^(general|général|générale|generale)$/i.test(channel.name));
  if (named) {
    return named;
  }

  return textChannels.first() ?? null;
}

const READY_TIMEOUT_MS = 15_000;

// Récupère les guildes : cache si possible, sinon on attend que le bot soit prêt,
// sinon on force un rechargement depuis l'API Discord.
async function fetchGuilds() {
  const client = getBotClient();

  if (!client?.guilds) {
    return [];
  }

  if (!client.isReady()) {
    try {
      await Promise.race([
        new Promise((resolve) => client.once("ready", resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS))
      ]);
    } catch {
      return [];
    }
  }

  let guilds = [...client.guilds.cache.values()];

  if (guilds.length === 0) {
    try {
      const fetched = await client.guilds.fetch();
      const collection = fetched instanceof Map ? fetched : fetched.cache;
      guilds = [...collection.values()];
    } catch {
      // On garde le cache tel quel.
    }
  }

  return guilds;
}

export async function listGuilds() {
  const guilds = await fetchGuilds();

  return guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount ?? 0
  }));
}

async function sendPayloadToGuilds(payload, guilds) {
  const results = [];

  for (const guild of guilds) {
    try {
      const channel = await findTargetChannel(guild);

      if (!channel) {
        results.push({ guild: guild.name, ok: false, reason: "aucun salon accessible" });
        continue;
      }

      await channel.send(payload);
      results.push({ guild: guild.name, ok: true, channel: channel.name });
    } catch (error) {
      results.push({ guild: guild.name, ok: false, reason: error.message });
    }
  }

  const sent = results.filter((result) => result.ok).length;
  return { total: results.length, sent, failed: results.length - sent, results };
}

// Envoie une charge utile sur tous les serveurs (salon système, sinon « general », sinon le premier salon accessible).
export async function sendToAllGuilds(payload) {
  const client = getBotClient();

  if (!client?.user) {
    throw new Error("Le bot Discord n'est pas connecté.");
  }

  const guilds = await fetchGuilds();
  return sendPayloadToGuilds(payload, guilds);
}

// Envoie l'embed : sur tous les serveurs par défaut, ou sur un serveur précis si guildId est fourni.
export async function broadcastToGuilds(spec, guildId = null) {
  const client = getBotClient();

  if (!client?.user) {
    throw new Error("Le bot Discord n'est pas connecté.");
  }

  const payload = buildBroadcastPayload(spec);
  let guilds = await fetchGuilds();

  if (guildId) {
    const guild = guilds.find((entry) => entry.id === guildId);

    if (!guild) {
      throw new Error("Serveur introuvable (le bot n'y est pas).");
    }

    guilds = [guild];
  }

  const result = await sendPayloadToGuilds(payload, guilds);
  return { ...result, guildId: guildId ?? null };
}
