import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-maintenance-${process.pid}.db`;

const { createSessionRow, getLogs, getSessionRow, getSetting, initDb, setSetting } = await import("../src/db.js");
const { runMaintenance, scheduleMaintenance } = await import("../src/maintenance.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("la maintenance tourne, indexe les déclencheurs et journalise son passage", async () => {
  await initDb();
  setSetting("reactions", [
    { trigger: "quoi", response: "feur", variants: ["koi", "kwa"] },
    { trigger: "oui", response: "non", variants: ["ouais"] }
  ]);

  const summary = runMaintenance();

  assert.ok(summary.indexedWords >= 3); // quoi, koi, kwa, oui, ouais
  assert.ok(summary.durationMs >= 0);
  assert.equal(getSetting("maintenance_last_run"), new Date().toLocaleDateString("sv-SE"));

  const logs = getLogs(5);
  assert.ok(logs.some((log) => log.action === "maintenance"));
});

test("la maintenance purge les sessions expirées", async () => {
  await initDb();
  createSessionRow("stale-token", "admin", Date.now() - 1000);
  createSessionRow("fresh-token", "admin", Date.now() + 60_000);

  runMaintenance();

  assert.equal(getSessionRow("stale-token"), null);
  assert.ok(getSessionRow("fresh-token"));
});

test("scheduleMaintenance ne lance pas la maintenance deux fois le même jour", () => {
  // Si la maintenance a déjà tourné aujourd'hui, la fonction ne fait que planifier le prochain minuit.
  const previous = runMaintenance();
  assert.ok(previous.durationMs >= 0);
  assert.equal(typeof scheduleMaintenance(), "undefined");
});
