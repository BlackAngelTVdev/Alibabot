import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-oauth-${process.pid}.db`;

const { initDb } = await import("../src/db.js");
const { clearDiscordLink, getDiscordLink, isOAuthConfigured, setDiscordLink, userGuilds } = await import("../src/discordOAuth.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("le lien Discord se sauvegarde et se relit par utilisateur", async () => {
  await initDb();

  assert.equal(getDiscordLink("alice"), null);

  setDiscordLink("alice", {
    id: "discord-1",
    username: "Alice",
    guilds: [
      { id: "g1", name: "Salam le Serveur" },
      { id: "g2", name: "Autre serveur" }
    ]
  });

  const link = getDiscordLink("alice");
  assert.equal(link.username, "Alice");
  assert.equal(link.guilds.length, 2);

  // Un autre utilisateur n'a pas ce lien.
  assert.equal(getDiscordLink("bob"), null);

  clearDiscordLink("alice");
  assert.equal(getDiscordLink("alice"), null);
});

test("userGuilds recoupe les serveurs du membre avec ceux du bot", async () => {
  await initDb();

  setDiscordLink("alice", {
    id: "discord-1",
    username: "Alice",
    guilds: [
      { id: "g1", name: "Salam le Serveur" },
      { id: "g2", name: "Autre serveur" },
      { id: "g9", name: "Serveur sans le bot" }
    ]
  });

  const botGuilds = [
    { id: "g1", name: "Salam le Serveur", memberCount: 42 },
    { id: "g2", name: "Autre serveur", memberCount: 7 },
    { id: "g3", name: "LaxaTest", memberCount: 3 }
  ];

  const visible = userGuilds("alice", botGuilds);
  assert.deepEqual(
    visible.map((guild) => guild.id),
    ["g1", "g2"]
  );
});

test("isOAuthConfigured détecte la configuration", () => {
  assert.equal(isOAuthConfigured(), Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET));
});
