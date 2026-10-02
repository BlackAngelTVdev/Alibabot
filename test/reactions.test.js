import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.DB_PATH = `test-reactions-${process.pid}.db`;

const { initDb, setSetting } = await import("../src/db.js");
const { createReaction, deleteReaction, findReaction, incrementReactionCount, readReactions, rebuildReactionIndex, updateReaction } = await import("../src/reactions.js");

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
  assert.equal(findReaction("bof ouais")?.response, "??");
  assert.equal(findReaction("bonjour"), null);
  assert.equal(findReaction("pourquoi"), null); // frontière de mot
  assert.equal(findReaction(""), null);
  assert.equal(findReaction(null), null);
});

test("seul le dernier mot du message déclenche", () => {
  setSetting("reactions", [{ trigger: "quoi", response: "feur", variants: ["koi"] }]);

  // Déclencheur en fin de message : ça déclenche.
  assert.equal(findReaction("ca va ou quoi")?.response, "feur");
  assert.equal(findReaction("tu dis koi")?.response, "feur");
  assert.equal(findReaction("quoi ?")?.response, "feur");
  assert.equal(findReaction("quoi...")?.response, "feur");
  assert.equal(findReaction("quoi 😂")?.response, "feur");

  // Déclencheur au début ou au milieu : ça ne déclenche PAS.
  assert.equal(findReaction("quoi comment c'est possible"), null);
  assert.equal(findReaction("quoi de neuf ?"), null);
  assert.equal(findReaction("koi tu dis"), null);

  // « ouais » est un variant de « oui » mais n'est pas en fin de message.
  setSetting("reactions", [{ trigger: "oui", response: "??", variants: ["ouais"] }]);
  assert.equal(findReaction("ouais bof"), null);
  assert.equal(findReaction("bof ouais")?.response, "??");
});

test("un déclencheur à plusieurs mots doit être en fin de message", () => {
  setSetting("reactions", [
    { trigger: "ca va", response: "et toi ?", variants: [] },
    { trigger: "quoi", response: "feur", variants: [] }
  ]);

  assert.equal(findReaction("ca va")?.response, "et toi ?");
  assert.equal(findReaction("salut ca va")?.response, "et toi ?");
  assert.equal(findReaction("ca va ou quoi")?.response, "feur"); // le dernier mot gagne
  assert.equal(findReaction("ca va pas"), null);
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

test("l'index de recherche reste synchronisé à chaque modification", () => {
  setSetting("reactions", [{ trigger: "quoi", response: "feur", variants: ["koi"] }]);
  assert.equal(findReaction("koi")?.response, "feur");

  // Modification : l'ancien variant ne doit plus matcher, le nouveau oui.
  updateReaction("quoi", { variants: ["kwa"] });
  assert.equal(findReaction("kwa")?.response, "feur");
  assert.equal(findReaction("koi"), null);

  // Création : le nouveau déclencheur matche immédiatement.
  createReaction("hein", "quoi ?");
  assert.equal(findReaction("hein")?.response, "quoi ?");

  // Suppression : plus rien ne matche.
  deleteReaction("quoi");
  assert.equal(findReaction("kwa"), null);

  // Écriture directe en base : l'index se régénère tout seul au prochain appel.
  setSetting("reactions", [{ trigger: "oui", response: "non", variants: [] }]);
  assert.equal(findReaction("oui")?.response, "non");

  // rebuildReactionIndex est appelable explicitement (maintenance nocturne).
  const index = rebuildReactionIndex();
  assert.ok(index.wordToReaction.has("oui"));
});
