import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

process.env.DB_PATH = `test-logs-${process.pid}.db`;

const { addLog, getLogs, initDb } = await import("../src/db.js");
const { default: initSqlJs } = await import("sql.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("les logs de plus de 30 jours sont supprimés", async () => {
  await initDb();

  // Injecte un vieux log (35 jours) directement dans le fichier SQLite.
  const SQL = await initSqlJs();
  const raw = new SQL.Database(readFileSync(process.env.DB_PATH));
  raw.run("INSERT INTO logs (timestamp, username, action, details) VALUES (?, ?, ?, ?)", [
    Date.now() - 35 * 24 * 60 * 60 * 1000,
    "test",
    "vieux log",
    ""
  ]);
  writeFileSync(process.env.DB_PATH, Buffer.from(raw.export()));
  raw.close();

  // Recharge la base puis ajoute un log récent (déclenche le nettoyage).
  await initDb();
  addLog("test", "nouveau log");

  const logs = getLogs(100);
  assert.ok(logs.some((log) => log.action === "nouveau log"), "le log récent doit rester");
  assert.ok(!logs.some((log) => log.action === "vieux log"), "le log de 35 jours doit être supprimé");
});
