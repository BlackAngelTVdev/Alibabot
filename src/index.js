import "dotenv/config";
import { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, Client, GatewayIntentBits } from "discord.js";
import { setBotClient } from "./bot.js";
import { sendAnnualReportIfDue } from "./annualReport.js";
import { consentActionRow, handleCodeSourceCommand, handleConsentCommand, handleHelpCommand, handleInviteCommand, handleProfileCommand, handleStatsCommand } from "./commands.js";
import { recordDailyTrigger } from "./dailyStats.js";
import { initDb } from "./db.js";
import { findReaction, incrementReactionCount } from "./reactions.js";
import { ensureUserStat, getUserStat, isPendingConsent, recordServerTrigger, recordUserTrigger, setUserConsent } from "./userStats.js";
import { readBotStatusConfig } from "./statusConfig.js";
import { startWebServer } from "./webServer.js";

let statusIndex = 0;

// Toujours affiché sur le profil du bot, quoi qu'il arrive (Discord interdit de modifier la bio d'un bot).
const creditStatus = {
  activityName: "développé par BlackAngelTVdev · https://github.com/BlackAngelTVdev",
  activityType: "playing",
  presenceStatus: "online"
};

function updateStatus(client) {
  const statusConfig = readBotStatusConfig();
  const statuses = [...statusConfig.statuses, creditStatus];
  const currentStatus = statuses[statusIndex % statuses.length];
  const activityType = ActivityType[currentStatus.activityType.charAt(0).toUpperCase() + currentStatus.activityType.slice(1)] ?? ActivityType.Playing;

  client.user.setPresence({
    activities: [{ name: currentStatus.activityName, type: activityType }],
    status: currentStatus.presenceStatus
  });

  statusIndex += 1;
}

await initDb();

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN manquant. Ajoute la variable d'environnement avant de lancer le bot.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

setBotClient(client);

client.once("ready", () => {
  console.log(`Connecté en tant que ${client.user.tag} — ${client.guilds.cache.size} serveur(s) en cache`);
  updateStatus(client);

  // Rapport annuel (le 4 mai) : vérifié peu après le démarrage, puis toutes les heures.
  setTimeout(() => {
    sendAnnualReportIfDue().catch((error) => console.error("Rapport annuel :", error.message));
  }, 30_000);
  setInterval(() => {
    sendAnnualReportIfDue().catch((error) => console.error("Rapport annuel :", error.message));
  }, 60 * 60 * 1000);

  setInterval(() => {
    updateStatus(client);
  }, 10_000);
});

startWebServer().catch((error) => {
  console.error("Impossible de démarrer l'interface web :", error.message);
  process.exit(1);
});

// Envoie en MP la demande de consentement (avec boutons) pour afficher (ou non) le pseudo sur le classement public.
async function sendConsentDm(user, entry) {
  await user.send({
    content:
      `Salut ${user.username} ! 👋\n\n` +
      `Le classement public du bot affiche les personnes qui le déclenchent le plus. ` +
      `Veux-tu que **ton pseudo** (${user.username}) y soit affiché ?\n\n` +
      `Ton numéro anonyme est **#${entry.anonId}** : si tu refuses (ou si tu ne réponds pas), ` +
      `tu apparaîtras en « Anonyme #${entry.anonId} ». Choisis ci-dessous :`,
    components: [consentActionRow()]
  });
}

// Gère une réponse « oui » / « non » en MP (uniquement quand la demande est en attente).
function handleConsentReply(message) {
  if (!isPendingConsent(message.author.id)) {
    return false;
  }

  const entry = getUserStat(message.author.id);
  const text = message.content.toLowerCase();

  if (/\boui\b/.test(text)) {
    setUserConsent(message.author.id, "yes");
    message.reply("Merci ! Ton pseudo sera affiché sur le classement public. 🎉").catch(() => {});
    return true;
  }

  if (/\bnon\b/.test(text)) {
    setUserConsent(message.author.id, "no");
    message.reply(`Compris ! Tu seras affiché en « Anonyme #${entry.anonId} » dans le classement.`).catch(() => {});
    return true;
  }

  return false;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  // En MP : les réponses de consentement, et la commande de consentement fonctionne aussi.
  if (!message.guild) {
    if (!handleConsentReply(message)) {
      await handleConsentCommand(message);
    }
    return;
  }

  if (await handleHelpCommand(message)) {
    return;
  }

  if (await handleStatsCommand(message)) {
    return;
  }

  if (await handleProfileCommand(message)) {
    return;
  }

  if (await handleInviteCommand(message)) {
    return;
  }

  if (await handleConsentCommand(message)) {
    return;
  }

  if (await handleCodeSourceCommand(message)) {
    return;
  }

  const reaction = findReaction(message.content);

  if (!reaction) {
    return;
  }

  incrementReactionCount(reaction.trigger);
  recordServerTrigger(message.guild);
  recordDailyTrigger(reaction.trigger, reaction.response, message.author);
  const { entry, first } = recordUserTrigger(message.author);

  if (first) {
    sendConsentDm(message.author, entry).catch(() => {
      // MP fermés : on reste en « pending » → affiché anonyme.
    });
  }

  await message.reply(reaction.response);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  const customId = String(interaction.customId ?? "");

  // Boutons de consentement (classement public) : on enregistre le choix et on retire les boutons.
  if (customId.startsWith("consent:")) {
    try {
      const choice = customId.slice("consent:".length); // « yes » ou « no »
      const entry = ensureUserStat(interaction.user);
      setUserConsent(interaction.user.id, choice);

      const confirmation =
        choice === "yes"
          ? `✅ Merci ! Ton pseudo (**${entry.username}**) sera affiché sur le classement public.`
          : `🙈 Compris ! Tu resteras en « **Anonyme #${entry.anonId}** » dans le classement.`;

      await interaction.update({ content: confirmation, components: [] });
    } catch {
      // Interaction déjà traitée ou expirée : on ignore.
    }
    return;
  }

  // Les boutons non-liens du broadcast n'ont pas encore d'action : on accuse simplement réception.
  try {
    const label = customId.replace(/^bc:/, "");
    await interaction.reply({ content: `Bouton « ${label} » cliqué ! (aucune action pour l'instant)`, ephemeral: true });
  } catch {
    // Interaction déjà répondue ou expirée : on ignore.
  }
});

client.login(token).catch((error) => {
  if (error?.message?.includes("Used disallowed intents")) {
    console.error("Discord refuse l'intent Message Content. Active-le dans le portail développeur Discord, onglet Bot > Privileged Gateway Intents, puis relance le bot.");
    process.exit(1);
  }

  throw error;
});
