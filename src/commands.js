import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } from "discord.js";
import { getBotClient } from "./bot.js";
import { readBotPrefix } from "./botConfig.js";
import { ensureUserStat, setUserConsent } from "./userStats.js";

// Permissions demandées lors de l'invitation : de quoi répondre proprement.
const INVITE_PERMISSIONS = new PermissionsBitField([
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AddReactions
]).bitfield;

// Retourne le texte après le préfixe, ou null si le message ne commence pas par le préfixe.
function commandRest(message) {
  const prefix = readBotPrefix();

  if (!message.content.startsWith(prefix)) {
    return null;
  }

  return message.content.slice(prefix.length).trim().toLowerCase();
}

export async function handleStatsCommand(message) {
  const rest = commandRest(message);

  if (rest !== "stats") {
    return false;
  }

  const publicUrl = String(process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const statsUrl = publicUrl ? `${publicUrl}/stats` : "";

  const embed = new EmbedBuilder()
    .setTitle("📊 Statistiques des réactions")
    .setColor(0x38bdf8)
    .setDescription(
      statsUrl
        ? `Retrouve les classements et toutes les statistiques ici :\n**[${statsUrl.replace(/^https?:\/\//, "")}](${statsUrl})**`
        : "Le lien vers la page publique des statistiques n'est pas configuré (variable d'environnement PUBLIC_URL)."
    );

  if (statsUrl) {
    embed.setURL(statsUrl);
  }

  await message.reply({ embeds: [embed] });
  return true;
}

export async function handleInviteCommand(message) {
  const rest = commandRest(message);

  if (rest !== "invite") {
    return false;
  }

  const client = getBotClient();

  if (!client?.user) {
    await message.reply("Le bot n'est pas encore connecté — réessaie dans un instant.");
    return true;
  }

  const botName = client.user.username ?? "le bot";
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=${INVITE_PERMISSIONS}&scope=bot`;

  const embed = new EmbedBuilder()
    .setTitle(`🔗 Invite ${botName}`)
    .setColor(0x38bdf8)
    .setDescription(`Clique ici pour [inviter ${botName} sur ton serveur](${inviteUrl}) !`)
    .setURL(inviteUrl);

  await message.reply({ embeds: [embed] });
  return true;
}

export async function handleProfileCommand(message) {
  const rest = commandRest(message);

  if (rest !== "pp" && !(rest?.startsWith("pp "))) {
    return false;
  }

  // Sans mention : la photo de profil de l'auteur. Avec mention : celle du user taggé.
  const target = message.mentions.users.first() ?? message.author;
  const avatarURL = target.displayAvatarURL({ size: 1024, extension: "png" });

  const embed = new EmbedBuilder()
    .setTitle("📸 Photo de profil")
    .setColor(0x38bdf8)
    .setDescription(`**[Télécharger la photo de ${target.username}](${avatarURL})**`)
    .setImage(avatarURL);

  await message.reply({ embeds: [embed] });
  return true;
}

// Lien du dépôt source du bot (affiché par !!codesource).
const SOURCE_REPO_URL = "https://github.com/BlackAngelTVdev/Alibabot";

export async function handleCodeSourceCommand(message) {
  const rest = commandRest(message);

  if (rest !== "codesource") {
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔧 Code source")
    .setColor(0x38bdf8)
    .setDescription(`Le code source du bot est disponible ici :\n**[${SOURCE_REPO_URL.replace(/^https?:\/\//, "")}](${SOURCE_REPO_URL})**`)
    .setURL(SOURCE_REPO_URL);

  await message.reply({ embeds: [embed] });
  return true;
}

// Rangée de boutons pour choisir son consentement (utilisée par la commande et le message privé).
export function consentActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("consent:yes")
      .setLabel("✅ Oui, afficher mon pseudo")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("consent:no")
      .setLabel("🙈 Non, rester anonyme")
      .setStyle(ButtonStyle.Secondary)
  );
}

// Commande de consentement : affiche le statut, ou passe à « oui » / « non ».
export async function handleConsentCommand(message) {
  const rest = commandRest(message);

  if (rest !== "consent" && !rest?.startsWith("consent ")) {
    return false;
  }

  const prefix = readBotPrefix();
  const choice = rest.split(/\s+/)[1];

  if (!choice) {
    const entry = ensureUserStat(message.author);
    const status =
      entry.consent === "yes"
        ? `Ton pseudo (**${entry.username}**) est affiché sur le classement public.`
        : entry.consent === "no"
          ? `Tu es affiché en « **Anonyme #${entry.anonId}** » sur le classement public.`
          : `Ton choix est encore en attente : tu es affiché en « **Anonyme #${entry.anonId}** » pour l'instant.`;

    await message.reply({
      content: `📊 **Consentement actuel**\n${status}\n\nChoisis ci-dessous :`,
      components: [consentActionRow()]
    });
    return true;
  }

  if (choice === "oui" || choice === "yes") {
    const entry = ensureUserStat(message.author);
    setUserConsent(message.author.id, "yes");
    await message.reply(`✅ Merci ! Ton pseudo (**${entry.username}**) sera affiché sur le classement public.`);
    return true;
  }

  if (choice === "non" || choice === "no") {
    const entry = ensureUserStat(message.author);
    setUserConsent(message.author.id, "no");
    await message.reply(`🙈 Compris ! Tu resteras en « **Anonyme #${entry.anonId}** » dans le classement.`);
    return true;
  }

  await message.reply(`Je n'ai pas compris « ${choice} ». Réponds \`${prefix}consent oui\` ou \`${prefix}consent non\`.`);
  return true;
}

// Commande d'aide : liste toutes les commandes avec le préfixe courant.
export async function handleHelpCommand(message) {
  const rest = commandRest(message);

  if (rest !== "help") {
    return false;
  }

  const prefix = readBotPrefix();
  const client = getBotClient();
  const botName = client?.user?.username ?? "le bot";

  const embed = new EmbedBuilder()
    .setTitle(`ℹ️ Aide — ${botName}`)
    .setColor(0x38bdf8)
    .setDescription("Voici tout ce que je sais faire :");

  const commands = [
    ["stats", "Lien vers la page publique des statistiques et des classements."],
    ["pp", `Télécharge ta photo de profil (${prefix}pp @user pour celle d'un autre).`],
    ["invite", "Lien pour m'inviter sur un autre serveur."],
    ["consent", `Voir ton statut de consentement pour le classement public (${prefix}consent oui / ${prefix}consent non pour changer d'avis).`],
    ["codesource", "Lien vers le code source du bot."],
    ["help", "Cette aide."]
  ];

  commands.forEach(([name, description]) => {
    embed.addFields({ name: `${prefix}${name}`, value: description });
  });

  const publicUrl = String(process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, "");

  if (publicUrl) {
    embed.addFields({
      name: "📈 Classement public",
      value: `[Voir les classements](${publicUrl}/stats)`
    });
  }

  await message.reply({ embeds: [embed] });
  return true;
}
