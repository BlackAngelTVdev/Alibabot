import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-daily-${process.pid}.db`;

const { initDb } = await import("../src/db.js");
const { dailyStats, recordDailyTrigger } = await import("../src/dailyStats.js");
const { recordUserTrigger, setUserConsent } = await import("../src/userStats.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("compte le top du jour en mémoire (total + tri décroissant)", async () => {
  await initDb();

  recordDailyTrigger("quoi", "feur", { id: "111", username: "Alice" });
  recordDailyTrigger("quoi", "feur", { id: "222", username: "Bob" });
  recordDailyTrigger("hein", "hein ?", { id: "111", username: "Alice" });

  const stats = dailyStats();
  assert.equal(stats.total, 3);
  assert.equal(stats.triggers.length, 2);
  assert.equal(stats.triggers[0].trigger, "quoi");
  assert.equal(stats.triggers[0].count, 2);
  assert.equal(stats.triggers[1].trigger, "hein");
  assert.equal(stats.triggers[1].count, 1);
  assert.equal(stats.users[0].count, 2);
});

test("le top du jour se remet à zéro au changement de jour", async () => {
  const today = new Date(2026, 4, 4, 12, 0, 0); // 4 mai 2026 à midi
  const yesterday = new Date(2026, 4, 3, 23, 0, 0);

  recordDailyTrigger("quoi", "feur", { id: "111", username: "Alice" }, yesterday);
  assert.equal(dailyStats(yesterday).total, 1);

  // Un nouveau jour : la journée d'hier est oubliée.
  const todayStats = dailyStats(today);
  assert.equal(todayStats.total, 0);
  assert.equal(todayStats.triggers.length, 0);
  assert.equal(todayStats.date, "2026-05-04");

  recordDailyTrigger("hein", "hein ?", { id: "111", username: "Alice" }, today);
  assert.equal(dailyStats(today).total, 1);
  assert.equal(dailyStats(today).triggers[0].trigger, "hein");
});

test("la personne du jour respecte le consentement", async () => {
  // En production, recordUserTrigger crée l'entrée en base avant le suivi du jour.
  recordUserTrigger({ id: "333", username: "Charlie" });
  recordUserTrigger({ id: "444", username: "Dana" });
  recordDailyTrigger("quoi", "feur", { id: "333", username: "Charlie" });
  recordDailyTrigger("quoi", "feur", { id: "444", username: "Dana" });

  const pending = dailyStats();
  assert.ok(pending.users[0].display.startsWith("Anonyme #"));

  setUserConsent("333", "yes");
  const afterYes = dailyStats();
  assert.ok(afterYes.users.some((row) => row.display === "Charlie"));

  setUserConsent("444", "no");
  const afterNo = dailyStats();
  assert.ok(afterNo.users.some((row) => row.display.startsWith("Anonyme #")));
  assert.ok(!afterNo.users.some((row) => row.display === "Dana"));
});

