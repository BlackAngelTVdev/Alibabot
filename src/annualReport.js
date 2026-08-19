import { EmbedBuilder } from "discord.js";
import { sendToAllGuilds } from "./broadcast.js";
import { getSetting, setSetting } from "./db.js";
import { readReactions } from "./reactions.js";
import { publicUserLeaderboard, serverLeaderboard } from "./userStats.js";

// Le rapport annuel part le 4 mai (04/05 au format français) de chaque année.
const REPORT_MONTH = 5; // mai
const REPORT_DAY = 4; // le 4

export function isReportDueToday(now = new Date()) {
  return now.getMonth() + 1 === REPORT_MONTH && now.getDate() === REPORT_DAY;
}

export function reportSentForYear(year) {
  return getSetting("annual_report_year") === year;
}

export function markReportSent(year) {
  setSetting("annual_report_year", year);
}

// Construit le gros rapport annuel : total, top réaction, top personne, top serveur, remerciement.
export function buildAnnualReport() {
  const year = new Date().getFullYear();
  const reactions = readReactions();
  const total = reactions.reduce((sum, reaction) => sum + (reaction.count ?? 0), 0);

  const topReaction = [...reactions].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  const topUser = publicUserLeaderboard()[0];
  const topServer = serverLeaderboard()[0];

  const embed = new EmbedBuilder()
    .setTitle(`📊 Rapport annuel ${year}`)
    .setColor(0x38bdf8)
    .setDescription(`Une année de plus à vos côtés — **merci à toute la communauté** ! 💙`);

  embed.addFields({
    name: "💬 Déclenchements au total",
    value: `Le bot a répondu **${total} fois** au total.`
  });

  if (topReaction) {
    embed.addFields({
      name: "⚡ Le mot le plus déclenché",
      value: `${topReaction.trigger} → ${topReaction.response} (**${topReaction.count ?? 0} fois**)`,
      inline: true
    });
  }

  if (topUser) {
    embed.addFields({
      name: "👤 La personne qui déclenche le plus",
      value: `${topUser.display} (**${topUser.count} fois**)`,
      inline: true
    });
  }

  if (topServer) {
    embed.addFields({
      name: "🌍 Le serveur le plus actif",
      value: `${topServer.name} (**${topServer.count} déclenchements**)`,
      inline: true
    });
  }

  embed.setFooter({ text: "Rendez-vous l'an prochain pour le prochain rapport ! 🎉" });

  return { embed, total };
}

// Envoie le rapport annuel sur tous les serveurs, une seule fois par année.
export async function sendAnnualReportIfDue() {
  const now = new Date();
  const year = now.getFullYear();

  if (!isReportDueToday(now) || reportSentForYear(year)) {
    return false;
  }

  const { embed } = buildAnnualReport();
  const result = await sendToAllGuilds({ embeds: [embed] });
  markReportSent(year);

  console.log(`Rapport annuel ${year} envoyé : ${result.sent}/${result.total} serveur(s)`);
  return true;
}
