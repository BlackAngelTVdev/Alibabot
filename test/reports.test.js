import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-reports-${process.pid}.db`;

const { initDb } = await import("../src/db.js");
const { addReport, clearReports, deleteReport, getReport, listReports, setReportResolved } = await import("../src/reports.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("ajoute, liste et lit un report", async () => {
  await initDb();
  clearReports();

  const report = addReport({
    guildId: "g1",
    guildName: "Salam le Serveur",
    channelName: "general",
    authorId: "111",
    authorName: "Alice",
    content: "Le bot ne répond plus quand je dis quoi."
  });

  assert.ok(report.id);
  assert.equal(report.guildName, "Salam le Serveur");
  assert.equal(report.resolved, false);

  const listed = listReports();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, report.id);

  const fetched = getReport(report.id);
  assert.equal(fetched.content, "Le bot ne répond plus quand je dis quoi.");
});

test("les reports sont triés du plus récent au plus ancien", async () => {
  clearReports();

  const first = addReport({ authorName: "Alice", content: "premier" });
  const second = addReport({ authorName: "Bob", content: "deuxième" });

  const listed = listReports();
  assert.equal(listed[0].id, second.id);
  assert.equal(listed[1].id, first.id);
});

test("marque un report résolu puis le rouvre", async () => {
  clearReports();

  const report = addReport({ authorName: "Alice", content: "à résoudre" });

  const resolved = setReportResolved(report.id, true);
  assert.equal(resolved.resolved, true);

  const reopened = setReportResolved(report.id, false);
  assert.equal(reopened.resolved, false);

  // Inconnu : retourne null.
  assert.equal(setReportResolved("inexistant", true), null);
});

test("supprime un report", async () => {
  clearReports();

  const report = addReport({ authorName: "Alice", content: "à supprimer" });

  assert.equal(deleteReport(report.id), true);
  assert.equal(getReport(report.id), null);
  assert.equal(listReports().length, 0);

  // Supprimer un report inconnu échoue.
  assert.equal(deleteReport("inexistant"), false);
});
