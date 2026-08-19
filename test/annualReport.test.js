import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-report-${process.pid}.db`;

const { initDb, setSetting } = await import("../src/db.js");
const { buildAnnualReport, isReportDueToday, markReportSent, reportSentForYear } = await import("../src/annualReport.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("la date du rapport est le 4 mai (04/05 au format français)", () => {
  // new Date(année, mois - 1, jour)
  assert.equal(isReportDueToday(new Date(2026, 4, 4)), true); // 4 mai
  assert.equal(isReportDueToday(new Date(2026, 4, 3)), false); // 3 mai
  assert.equal(isReportDueToday(new Date(2026, 3, 4)), false); // 4 avril
  assert.equal(isReportDueToday(new Date(2026, 4, 5)), false); // 5 mai
  assert.equal(isReportDueToday(new Date(2027, 4, 4)), true); // toutes les années
});

test("le rapport n'est envoyé qu'une seule fois par année", async () => {
  await initDb();

  assert.equal(reportSentForYear(2026), false);
  markReportSent(2026);
  assert.equal(reportSentForYear(2026), true);
  assert.equal(reportSentForYear(2027), false);
});

test("construit le gros rapport annuel (total, top réaction, top personne, top serveur, merci)", async () => {
  setSetting("reactions", [
    { trigger: "quoi", response: "feur", variants: [], count: 10 },
    { trigger: "mdr", response: "😂", variants: [], count: 4 }
  ]);
  setSetting("user_stats", {
    "111": { userId: "111", username: "Alice", count: 8, consent: "yes", anonId: 1 },
    "222": { userId: "222", username: "Bob", count: 3, consent: "no", anonId: 2 }
  });
  setSetting("server_stats", {
    "g1": { guildId: "g1", name: "Salam le Serveur", count: 9 },
    "g2": { guildId: "g2", name: "LaxaTest", count: 2 }
  });

  const { embed, total } = buildAnnualReport();

  assert.equal(total, 14);
  assert.ok(embed.data.title.includes("Rapport annuel"));
  assert.ok(embed.data.description.toLowerCase().includes("merci"));

  const fields = embed.data.fields.map((field) => field.name);
  assert.ok(fields.some((name) => name.includes("Déclenchements au total")));
  assert.ok(fields.some((name) => name.includes("mot le plus déclenché")));
  assert.ok(fields.some((name) => name.includes("personne qui déclenche")));
  assert.ok(fields.some((name) => name.includes("serveur le plus actif")));

  // Le top personne respecte le consentement : Alice (yes) en clair, Bob (no) absent du top.
  const personField = embed.data.fields.find((field) => field.name.includes("personne qui déclenche"));
  assert.ok(personField.value.includes("Alice"));

  // Le top serveur est bien Salam le Serveur.
  const serverField = embed.data.fields.find((field) => field.name.includes("serveur le plus actif"));
  assert.ok(serverField.value.includes("Salam le Serveur"));
});
