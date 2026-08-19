import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-commands-${process.pid}.db`;

const { initDb, setSetting } = await import("../src/db.js");
const { setBotClient } = await import("../src/bot.js");
const { handleCodeSourceCommand, handleConsentCommand, handleHelpCommand, handleInviteCommand, handleProfileCommand, handleStatsCommand } = await import("../src/commands.js");
const { getUserStat } = await import("../src/userStats.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

function makeMessage(content, targetName = null) {
  const replies = [];
  const author = {
    id: "author-1",
    username: "alice",
    displayAvatarURL: () => "https://cdn.discordapp.com/avatars/1/alice.png?size=1024"
  };
  const target = targetName
    ? {
        username: targetName,
        displayAvatarURL: () => `https://cdn.discordapp.com/avatars/2/${targetName}.png?size=1024`
      }
    : null;

  return {
    content,
    author,
    mentions: { users: { first: () => target } },
    replies,
    reply: async (payload) => {
      replies.push(payload);
    }
  };
}

test("!!pp sans mention -> la photo de profil de l'auteur", async () => {
  await initDb();
  setSetting("bot_prefix", "!!");

  const message = makeMessage("!!pp");
  assert.equal(await handleProfileCommand(message), true);

  const embed = message.replies[0].embeds[0];
  assert.equal(embed.data.title, "📸 Photo de profil");
  assert.ok(embed.data.image.url.includes("alice"));
  assert.ok(embed.data.description.includes("Télécharger la photo de alice"));
});

test("!!pp avec mention -> la photo de profil du user taggé", async () => {
  const message = makeMessage("!!pp @bob", "bob");
  assert.equal(await handleProfileCommand(message), true);

  const embed = message.replies[0].embeds[0];
  assert.ok(embed.data.image.url.includes("bob"));
  assert.ok(embed.data.description.includes("Télécharger la photo de bob"));
});

test("pp ne répond pas aux autres messages", async () => {
  assert.equal(await handleProfileCommand(makeMessage("bonjour")), false);
  assert.equal(await handleProfileCommand(makeMessage("!!ppp")), false);
  assert.equal(await handleProfileCommand(makeMessage("!! stats")), false);
});

test("!!stats donne le lien vers la page publique sans lister chaque mot", async () => {
  setSetting("reactions", [{ trigger: "quoi", response: "feur", variants: [], count: 2 }]);
  const oldPublicUrl = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = "https://quoi.laxacube.ch";

  try {
    const message = makeMessage("!!stats");
    assert.equal(await handleStatsCommand(message), true);

    const embed = message.replies[0].embeds[0];
    assert.equal(embed.data.title, "📊 Statistiques des réactions");
    assert.ok(embed.data.description.includes("quoi.laxacube.ch/stats"));
    assert.equal(embed.data.url, "https://quoi.laxacube.ch/stats");
    // Plus aucun décompte par mot.
    assert.ok(!embed.data.description.includes("💬 quoi"));
    assert.ok(!embed.data.description.includes("2 fois"));
    assert.ok(!embed.data.fields || embed.data.fields.length === 0);
  } finally {
    if (oldPublicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = oldPublicUrl;
    }
  }
});

test("les commandes marchent aussi avec le préfixe par défaut", async () => {
  setSetting("bot_prefix", "!");

  assert.equal(await handleProfileCommand(makeMessage("!pp")), true);
  assert.equal(await handleStatsCommand(makeMessage("!stats")), true);
  assert.equal(await handleInviteCommand(makeMessage("!invite")), true);
});

test("!!invite renvoie le lien d'invitation du bot avec son vrai nom", async () => {
  setSetting("bot_prefix", "!!");
  setBotClient({ user: { id: "123456789012", username: "Koifeur" } });

  const message = makeMessage("!!invite");
  assert.equal(await handleInviteCommand(message), true);

  const embed = message.replies[0].embeds[0];
  assert.equal(embed.data.title, "🔗 Invite Koifeur");
  assert.ok(embed.data.description.includes("inviter Koifeur"));
  assert.ok(embed.data.description.includes("client_id=123456789012"));
  assert.ok(embed.data.description.includes("scope=bot"));
  assert.ok(embed.data.description.includes("permissions="));
});

test("!!invite n'est pas déclenché par un autre message", async () => {
  assert.equal(await handleInviteCommand(makeMessage("bonjour")), false);
  assert.equal(await handleInviteCommand(makeMessage("!!invitation")), false);
});

test("!!codesource renvoie le lien du repo", async () => {
  const message = makeMessage("!!codesource");
  assert.equal(await handleCodeSourceCommand(message), true);

  const embed = message.replies[0].embeds[0];
  assert.equal(embed.data.title, "🔧 Code source");
  assert.ok(embed.data.description.includes("github.com/BlackAngelTVdev/Alibabot"));
  assert.equal(embed.data.url, "https://github.com/BlackAngelTVdev/Alibabot");
});

test("!!codesource n'est pas déclenché par un autre message", async () => {
  assert.equal(await handleCodeSourceCommand(makeMessage("bonjour")), false);
  assert.equal(await handleCodeSourceCommand(makeMessage("!!code")), false);
  assert.equal(await handleCodeSourceCommand(makeMessage("!! stats")), false);
});

test("!!consent sans argument affiche le statut actuel avec des boutons oui/non", async () => {
  setSetting("bot_prefix", "!!");

  const message = makeMessage("!!consent");
  assert.equal(await handleConsentCommand(message), true);

  const reply = message.replies[0];
  assert.ok(reply.content.includes("Consentement actuel"));
  assert.ok(reply.content.includes("Anonyme #"));
  assert.ok(reply.components.length > 0);
  const customIds = reply.components[0].components.map((button) => button.data.custom_id);
  assert.ok(customIds.includes("consent:yes"));
  assert.ok(customIds.includes("consent:no"));
});

test("!!consent oui affiche le pseudo sur le classement public", async () => {
  const message = makeMessage("!!consent oui");
  assert.equal(await handleConsentCommand(message), true);
  assert.ok(message.replies[0].includes("sera affiché"));
  assert.equal(getUserStat("author-1").consent, "yes");
});

test("!!consent non (ou no) repasse en anonyme", async () => {
  const message = makeMessage("!!consent no");
  assert.equal(await handleConsentCommand(message), true);
  assert.ok(message.replies[0].includes("Anonyme #"));
  assert.equal(getUserStat("author-1").consent, "no");

  const back = makeMessage("!!consent non");
  assert.equal(await handleConsentCommand(back), true);
  assert.equal(getUserStat("author-1").consent, "no");
});

test("!!consent ne répond pas aux autres messages ni aux choix inconnus", async () => {
  assert.equal(await handleConsentCommand(makeMessage("bonjour")), false);
  assert.equal(await handleConsentCommand(makeMessage("!!consentir")), false);
  assert.equal(await handleConsentCommand(makeMessage("!! stats")), false);

  const unknown = makeMessage("!!consent peut-être");
  assert.equal(await handleConsentCommand(unknown), true);
  assert.ok(unknown.replies[0].includes("Je n'ai pas compris"));
});

test("!!help liste toutes les commandes avec le préfixe courant", async () => {
  setSetting("bot_prefix", "!!");
  setBotClient({ user: { id: "123456789012", username: "Koifeur" } });

  const message = makeMessage("!!help");
  assert.equal(await handleHelpCommand(message), true);

  const embed = message.replies[0].embeds[0];
  assert.ok(embed.data.title.includes("Aide — Koifeur"));
  const names = embed.data.fields.map((field) => field.name);
  ["!!stats", "!!pp", "!!invite", "!!consent", "!!help"].forEach((command) => {
    assert.ok(names.includes(command), `l'aide contient ${command}`);
  });

  // Les références dans les descriptions suivent aussi le préfixe courant.
  const consentField = embed.data.fields.find((field) => field.name === "!!consent");
  assert.ok(consentField.value.includes("!!consent oui"));
  const ppField = embed.data.fields.find((field) => field.name === "!!pp");
  assert.ok(ppField.value.includes("!!pp @user"));
});

test("!!help reflète le préfixe dans les descriptions quand il change", async () => {
  setSetting("bot_prefix", "$");

  const message = makeMessage("$help");
  assert.equal(await handleHelpCommand(message), true);

  const embed = message.replies[0].embeds[0];
  const names = embed.data.fields.map((field) => field.name);
  assert.ok(names.includes("$consent"));
  const consentField = embed.data.fields.find((field) => field.name === "$consent");
  assert.ok(consentField.value.includes("$consent oui"));
});

test("!!help fonctionne avec le préfixe par défaut et ignore les autres messages", async () => {
  setSetting("bot_prefix", "!");

  const message = makeMessage("!help");
  assert.equal(await handleHelpCommand(message), true);
  assert.ok(message.replies[0].embeds[0].data.fields[0].name.startsWith("!"));

  assert.equal(await handleHelpCommand(makeMessage("bonjour")), false);
  assert.equal(await handleHelpCommand(makeMessage("!!helper")), false);
  assert.equal(await handleHelpCommand(makeMessage("!! stats")), false);
});
