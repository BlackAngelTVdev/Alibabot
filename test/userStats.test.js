import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-users-${process.pid}.db`;

const { initDb } = await import("../src/db.js");
const {
  clearUserStats,
  getUserStat,
  isPendingConsent,
  publicUserLeaderboard,
  recordServerTrigger,
  recordUserTrigger,
  serverLeaderboard,
  setUserConsent
} = await import("../src/userStats.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("compte les déclenchements par utilisateur", async () => {
  await initDb();

  const alice = { id: "111", username: "Alice" };
  const bob = { id: "222", username: "Bob" };

  const firstAlice = recordUserTrigger(alice);
  assert.equal(firstAlice.first, true);
  assert.equal(firstAlice.entry.count, 1);

  recordUserTrigger(alice);
  recordUserTrigger(bob);

  assert.equal(getUserStat("111").count, 2);
  assert.equal(getUserStat("222").count, 1);
  assert.equal(isPendingConsent("111"), true);
});

test("attribue un numéro anonyme unique à chaque nouvel utilisateur", async () => {
  recordUserTrigger({ id: "333", username: "Charlie" });
  recordUserTrigger({ id: "444", username: "Dana" });

  assert.notEqual(getUserStat("333").anonId, getUserStat("444").anonId);
});

test("le classement anonymise par défaut (pending) et affiche le pseudo après consentement", async () => {
  const board = publicUserLeaderboard();

  // Alice (2) et Bob (1) sont pending → anonymes.
  const aliceRow = board.find((row) => row.count === 2);
  assert.ok(aliceRow.display.startsWith("Anonyme #"));

  setUserConsent("111", "yes");
  const boardAfterYes = publicUserLeaderboard();
  assert.ok(boardAfterYes.some((row) => row.display === "Alice" && row.count === 2));

  setUserConsent("222", "no");
  const boardFinal = publicUserLeaderboard();
  const bobRow = boardFinal.find((row) => row.count === 1);
  assert.ok(bobRow.display.startsWith("Anonyme #"));
  assert.ok(!boardFinal.some((row) => row.display === "Bob"));
});

test("le classement est trié par nombre de déclenchements décroissant", async () => {
  recordUserTrigger({ id: "222", username: "Bob" });
  recordUserTrigger({ id: "222", username: "Bob" });

  const counts = publicUserLeaderboard().map((row) => row.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

test("compte les déclenchements par serveur et classe par activité", async () => {
  recordServerTrigger({ id: "g1", name: "Salam le Serveur" });
  recordServerTrigger({ id: "g1", name: "Salam le Serveur" });
  recordServerTrigger({ id: "g2", name: "LaxaTest" });

  const board = serverLeaderboard();
  assert.equal(board.length, 2);
  assert.equal(board[0].name, "Salam le Serveur");
  assert.equal(board[0].count, 2);
  assert.equal(board[1].name, "LaxaTest");
  assert.equal(board[1].count, 1);
  assert.deepEqual(board.map((entry) => entry.count), [2, 1]);
});

test("clearUserStats vide tout le suivi", async () => {
  recordUserTrigger({ id: "555", username: "Eve" });
  recordUserTrigger({ id: "666", username: "Frank" });

  const removed = clearUserStats();
  assert.ok(removed >= 2);
  assert.equal(getUserStat("555"), null);
  assert.equal(getUserStat("666"), null);
  assert.equal(publicUserLeaderboard().length, 0);

  // Tout le monde repart de zéro : un nouveau déclenchement recrée l'entrée en « pending ».
  const fresh = recordUserTrigger({ id: "555", username: "Eve" });
  assert.equal(fresh.first, true);
  assert.equal(fresh.entry.consent, "pending");
});
