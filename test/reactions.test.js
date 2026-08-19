import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-reactions-${process.pid}.db`;

const { initDb, setSetting } = await import("../src/db.js");
const { createReaction, findReaction, incrementReactionCount, readReactions, updateReaction } = await import("../src/reactions.js");

test.after(() => {
  rmSync(process.env.DB_PATH, { force: true });
});

test("repond selon le mot declencheur et sa reponse", async () => {
  await initDb();
  setSetting("reactions", [
    { trigger: "quoi", response: "feur", variants: ["koi", "kwa"] },
    { trigger: "oui", response: "??", variants: ["ouais"] }
  ]);

  assert.equal(findReaction("quoi ?")?.response, "feur");
  assert.equal(findReaction("tu dis koi")?.response, "feur");
  assert.equal(findReaction("kwa")?.trigger, "quoi");
  assert.equal(findReaction("ouais bof")?.response, "??");
  assert.equal(findReaction("bonjour"), null);
  assert.equal(findReaction("pourquoi"), null); // frontière de mot
  assert.equal(findReaction(""), null);
  assert.equal(findReaction(null), null);
});

test("le mot declencheur lui-meme declenche la reponse", () => {
  setSetting("reactions", [{ trigger: "hein", response: "quoi ?", variants: [] }]);

  assert.equal(findReaction("hein ?")?.response, "quoi ?");
});

test("normalise les reactions stockees", () => {
  setSetting("reactions", [
    { trigger: "  OUI ", response: "  bof  ", variants: ["OUAIS", "oué", "ouais"] },
    { trigger: "", response: "invalide", variants: [] },
    { trigger: "quoi", response: "feur", variants: ["KOI"] },
    { trigger: "QUOI", response: "dupliquée", variants: [] }
  ]);

  const reactions = readReactions();
  assert.equal(reactions.length, 2);
  assert.deepEqual(reactions[0], { trigger: "oui", response: "bof", variants: ["ouais", "oue"], count: 0 });
  assert.deepEqual(reactions[1], { trigger: "quoi", response: "feur", variants: ["koi"], count: 0 });
});

test("un message contenant un variant avec accent declenche la reponse", () => {
  setSetting("reactions", [{ trigger: "quoi", response: "feur", variants: ["koi", "kouâ"] }]);

  assert.equal(findReaction("il a dit kouâ")?.response, "feur");
  assert.equal(findReaction("il a dit koua")?.response, "feur");
});

test("une réaction créée démarre à zéro réponse", async () => {
  await initDb();
  const reaction = createReaction("hein", "quoi ?");
  assert.equal(reaction.count, 0);
});

test("le compteur s'incrémente et survit aux modifications", () => {
  setSetting("reactions", [{ trigger: "quoi", response: "feur", variants: ["koi"], count: 3 }]);

  const updated = updateReaction("quoi", { variants: ["koi", "kwa"] });
  assert.equal(updated.count, 3);

  incrementReactionCount("quoi");
  incrementReactionCount("quoi");
  assert.equal(readReactions()[0].count, 5);

  // Un trigger inconnu ne doit ni planter ni créer d'entrée.
  assert.equal(incrementReactionCount("inconnu"), null);
  assert.equal(readReactions().length, 1);
});
