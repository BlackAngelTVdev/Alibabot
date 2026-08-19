import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { ButtonStyle } from "discord.js";

process.env.DB_PATH = `test-broadcast-${process.pid}.db`;

const { buildBroadcastPayload, canBroadcast, markBroadcastUsed, nextBroadcastDelayMs } = await import("../src/broadcast.js");
const { initDb } = await import("../src/db.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("construit un embed simple avec titre, description et couleur", () => {
  const payload = buildBroadcastPayload({
    title: "Annonce",
    description: "Salut à tous !",
    color: "#ff0000"
  });

  const embed = payload.embeds[0].data;
  assert.equal(embed.title, "Annonce");
  assert.equal(embed.description, "Salut à tous !");
  assert.equal(embed.color, 0xff0000);
});

test("une couleur invalide retombe sur le bleu par défaut", () => {
  const payload = buildBroadcastPayload({ title: "x", color: "pas-une-couleur" });
  assert.equal(payload.embeds[0].data.color, 0x38bdf8);
});

test("refuse un embed vide", () => {
  assert.throws(() => buildBroadcastPayload({}), /titre, une description ou une image/);
});

test("les champs et l'auteur sont ajoutés", () => {
  const payload = buildBroadcastPayload({
    title: "t",
    authorName: "AliBaBot",
    footer: "fin",
    fields: [
      { name: "A", value: "1", inline: true },
      { name: "B", value: "2" }
    ]
  });

  const embed = payload.embeds[0].data;
  assert.equal(embed.author.name, "AliBaBot");
  assert.equal(embed.footer.text, "fin");
  assert.equal(embed.fields.length, 2);
  assert.equal(embed.fields[0].inline, true);
});

test("les champs vides sont ignorés", () => {
  const payload = buildBroadcastPayload({
    title: "t",
    fields: [{ name: "", value: "1" }, { name: "B", value: "" }]
  });
  assert.equal(payload.embeds[0].data.fields?.length ?? 0, 0);
});

test("les boutons liens et boutons d'action sont construits", () => {
  const payload = buildBroadcastPayload({
    title: "t",
    buttons: [
      { label: "Discord", style: "link", url: "https://discord.com" },
      { label: "Vote", style: "success" }
    ]
  });

  const rows = payload.components;
  assert.equal(rows.length, 1);
  const buttons = rows[0].components;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].data.style, ButtonStyle.Link);
  assert.equal(buttons[0].data.url, "https://discord.com");
  assert.equal(buttons[1].data.style, ButtonStyle.Success);
});

test("un bouton lien sans URL valide est refusé", () => {
  assert.throws(
    () => buildBroadcastPayload({ title: "t", buttons: [{ label: "x", style: "link", url: "pas-une-url" }] }),
    /URL valide/
  );
});

test("6 boutons sont répartis en 2 rangées de 5", () => {
  const buttons = Array.from({ length: 6 }, (_, index) => ({
    label: "B" + index,
    style: "link",
    url: "https://example.com"
  }));

  const payload = buildBroadcastPayload({ title: "t", buttons });
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components.length, 5);
  assert.equal(payload.components[1].components.length, 1);
});

test("la limite quotidienne autorise le premier envoi puis bloque pendant 24 h", async () => {
  await initDb();

  assert.equal(canBroadcast("bob"), true);

  markBroadcastUsed("bob");
  assert.equal(canBroadcast("bob"), false);
  assert.ok(nextBroadcastDelayMs("bob") > 0);

  // Les autres comptes ne sont pas affectés.
  assert.equal(canBroadcast("alice"), true);
});
