import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { setBotClient } from "../src/bot.js";

process.env.DB_PATH = `test-champion-${process.pid}.db`;

const { initDb } = await import("../src/db.js");
await initDb();

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

const {
  CHAMPION_ROLE_NAME,
  championRoleGuilds,
  crownGuildChampion,
  dayChampions,
  ensureChampionRole,
  isChampionRoleEnabled,
  recordChampionTrigger,
  refreshGuildChampion,
  resetChampionTracking,
  setChampionRoleEnabled,
  setChampionRoleEnabledForGuild
} = await import("../src/dailyChampion.js");

function makeMember(id, username) {
  return {
    id,
    user: { username },
    roles: {
      cache: new Map(),
      add: async function add(role) {
        this.cache.set(role.id, role);
      },
      remove: async function remove(role) {
        this.cache.delete(role.id);
      }
    }
  };
}

// Collection simulée : un Map avec les méthodes utiles de discord.js (.find, .filter).
function fakeCollection(entries) {
  const map = new Map(entries);
  map.find = (predicate) => {
    for (const value of map.values()) {
      if (predicate(value)) {
        return value;
      }
    }
    return undefined;
  };
  map.filter = (predicate) => {
    const filtered = new Map();
    for (const [key, value] of map) {
      if (predicate(value)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  };
  return map;
}

function makeGuild(id, name, members) {
  const rolesCache = fakeCollection();
  const membersCache = fakeCollection(members.map((member) => [member.id, member]));

  const guild = {
    id,
    name,
    ownerId: "owner-1",
    roles: {
      cache: rolesCache,
      everyone: { id: "everyone", position: 0 },
      create: async (options) => {
        const role = { id: "champ-role", position: 2, ...options };
        rolesCache.set(role.id, role);
        return role;
      }
    },
    members: {
      cache: membersCache,
      me: {
        roles: { highest: { id: "bot-role", position: 5 } },
        permissions: { has: () => true }
      },
      fetch: async (id) => (id ? membersCache.get(id) : membersCache)
    },
    fetchOwner: async () => ({ send: async () => {} })
  };

  return guild;
}

test("compte les déclenchements du jour par serveur et par utilisateur", () => {
  resetChampionTracking();

  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("222", "Bob", "g1");
  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("333", "Charlie", "g2");

  const champions = dayChampions();

  assert.equal(champions.length, 2);

  const g1 = champions.find((entry) => entry.guildId === "g1");
  const g2 = champions.find((entry) => entry.guildId === "g2");

  assert.equal(g1.userId, "111");
  assert.equal(g1.username, "Alice");
  assert.equal(g1.count, 2);
  assert.equal(g2.userId, "333");
  assert.equal(g2.username, "Charlie");
  assert.equal(g2.count, 1);
});

test("le champion de chaque serveur est celui qui déclenche le plus", () => {
  resetChampionTracking();

  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("222", "Bob", "g1");
  recordChampionTrigger("222", "Bob", "g1");
  recordChampionTrigger("222", "Bob", "g1");

  const champions = dayChampions();

  assert.equal(champions.length, 1);
  assert.equal(champions[0].userId, "222");
  assert.equal(champions[0].count, 3);
});

test("le comptage repart de zéro au changement de jour", () => {
  resetChampionTracking();

  const today = new Date(2026, 4, 4, 12, 0, 0);
  const tomorrow = new Date(2026, 4, 5, 0, 0, 0);

  recordChampionTrigger("111", "Alice", "g1", today);
  assert.equal(dayChampions().length, 1);

  // Nouveau jour : la journée d'hier est oubliée, le champion repart de zéro (Bob, pas Alice).
  recordChampionTrigger("222", "Bob", "g1", tomorrow);
  const champions = dayChampions();
  assert.equal(champions.length, 1);
  assert.equal(champions[0].userId, "222");
  assert.equal(champions[0].count, 1);
});

test("le nom du rôle est bien défini", () => {
  assert.equal(typeof CHAMPION_ROLE_NAME, "string");
  assert.ok(CHAMPION_ROLE_NAME.length > 0);
});

test("crée le rôle au démarrage, sans attendre un déclenchement", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const guild = makeGuild("g1", "Salam le Serveur", [alice]);

  // Aucun déclenchement enregistré : le rôle est quand même créé.
  const role = await ensureChampionRole(guild);

  assert.ok(role);
  assert.equal(role.name, CHAMPION_ROLE_NAME);
  assert.equal(role.hoist, true);
  assert.equal(guild.roles.cache.get("champ-role").name, CHAMPION_ROLE_NAME);
});

test("ne crée pas deux fois le rôle s'il existe déjà", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const guild = makeGuild("g1", "Salam le Serveur", [alice]);

  let createCount = 0;
  guild.roles.create = async (options) => {
    createCount += 1;
    const role = { id: "champ-role", position: 2, ...options };
    guild.roles.cache.set(role.id, role);
    return role;
  };

  await ensureChampionRole(guild);
  await ensureChampionRole(guild);

  assert.equal(createCount, 1);
});

test("couronne le leader du jour en direct (création du rôle + attribution)", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const bob = makeMember("222", "Bob");
  const guild = makeGuild("g1", "Salam le Serveur", [alice, bob]);

  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("222", "Bob", "g1");

  const result = await refreshGuildChampion(guild);

  // Alice mène (2 contre 1) : le rôle est créé et lui est attribué.
  assert.equal(result.ok, true);
  assert.equal(result.winner, "Alice");
  assert.ok(guild.roles.cache.has("champ-role"));
  assert.equal(guild.roles.cache.get("champ-role").name, CHAMPION_ROLE_NAME);
  assert.equal(guild.roles.cache.get("champ-role").hoist, true);
  assert.equal(alice.roles.cache.has("champ-role"), true);
  assert.equal(bob.roles.cache.has("champ-role"), false);
});

test("le système peut être désactivé serveur par serveur", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const guildA = makeGuild("g1", "Salam le Serveur", [alice]);
  const guildB = makeGuild("g2", "LaxaTest", [alice]);

  // Désactivé sur g1 seulement : g1 ne couronne pas, g2 oui.
  setChampionRoleEnabledForGuild("g1", false);
  assert.equal(isChampionRoleEnabled("g1"), false);
  assert.equal(isChampionRoleEnabled("g2"), true);

  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("111", "Alice", "g2");

  const resultA = await refreshGuildChampion(guildA);
  const resultB = await refreshGuildChampion(guildB);

  assert.equal(resultA, null);
  assert.equal(guildA.roles.cache.size, 0);
  assert.equal(resultB.ok, true);
  assert.equal(guildB.roles.cache.size, 1);

  // Le réglage par serveur est persisté et listé.
  const states = championRoleGuilds();
  assert.equal(states.g1, false);

  // Nettoyage : on réactive g1 pour ne pas influencer les autres tests.
  setChampionRoleEnabledForGuild("g1", true);
});

test("le système peut être désactivé (aucun rôle attribué)", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const guild = makeGuild("g1", "Salam le Serveur", [alice]);

  recordChampionTrigger("111", "Alice", "g1");

  // Désactivé : même avec un leader, aucun rôle n'est créé ni attribué.
  setChampionRoleEnabled(false);
  assert.equal(isChampionRoleEnabled(), false);

  const result = await refreshGuildChampion(guild);
  assert.equal(result, null);
  assert.equal(guild.roles.cache.size, 0);
  assert.equal(alice.roles.cache.has("champ-role"), false);

  // Réactivé : le couronnement fonctionne à nouveau.
  setChampionRoleEnabled(true);
  const reactivated = await refreshGuildChampion(guild);
  assert.equal(reactivated.ok, true);
  assert.equal(alice.roles.cache.has("champ-role"), true);
});

test("le rôle change de main quand quelqu'un dépasse le leader", async () => {
  resetChampionTracking();
  setBotClient({ user: { id: "bot-1" } });

  const alice = makeMember("111", "Alice");
  const bob = makeMember("222", "Bob");
  const guild = makeGuild("g1", "Salam le Serveur", [alice, bob]);

  recordChampionTrigger("111", "Alice", "g1");
  recordChampionTrigger("111", "Alice", "g1");
  await refreshGuildChampion(guild);
  assert.equal(alice.roles.cache.has("champ-role"), true);

  // Bob déclenche 3 fois : il dépasse Alice, le rôle change de main.
  recordChampionTrigger("222", "Bob", "g1");
  recordChampionTrigger("222", "Bob", "g1");
  recordChampionTrigger("222", "Bob", "g1");

  const result = await refreshGuildChampion(guild);

  assert.equal(result.ok, true);
  assert.equal(result.winner, "Bob");
  assert.equal(alice.roles.cache.has("champ-role"), false);
  assert.equal(bob.roles.cache.has("champ-role"), true);
});
