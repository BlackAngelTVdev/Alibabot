import "dotenv/config";
import { getSetting, initDb, setSetting } from "./db.js";

// Exemples de réactions pour tester les fonctionnalités (réactions, compteurs, !stats).
// Le seeder est additif : il n'écrase jamais une réaction qui existe déjà.
// `npm run seed` → ajoute ce qui manque.
// `npm run seed -- --reset` → remplace TOUTES les réactions par ces exemples.
const sampleReactions = [
  { trigger: "quoi", response: "feur", variants: [], count: 87 },
  { trigger: "oui", response: "non", variants: ["ouais", "oue", "ouaip", "mouais"], count: 23 },
  { trigger: "hein", response: "quoi ?", variants: ["hin", "hien"], count: 15 },
  { trigger: "non", response: "si !", variants: ["nan", "nanan", "nope"], count: 9 },
  { trigger: "ca va", response: "et toi ?", variants: ["sa va", "sava", "cv"], count: 31 },
  { trigger: "mdr", response: "😂", variants: ["lol", "mdrr", "ptdr", "xptdr"], count: 42 },
  { trigger: "jsp", response: "moi non plus…", variants: ["je sais pas", "chais pas", "j en sais rien"], count: 7 },
  { trigger: "ok", response: "tres bien 👍", variants: ["oke", "okkk", "dac", "dacodac"], count: 18 }
];

const force = process.argv.includes("--reset");

function normalizeTrigger(value) {
  return String(value).trim().toLowerCase();
}

async function main() {
  await initDb();

  const stored = Array.isArray(getSetting("reactions")) ? getSetting("reactions") : [];
  const existing = force ? [] : stored;
  const triggers = new Set(existing.map((entry) => normalizeTrigger(entry?.trigger)));

  const added = [];
  const skipped = [];

  for (const sample of sampleReactions) {
    const trigger = normalizeTrigger(sample.trigger);

    if (!force && triggers.has(trigger)) {
      skipped.push(trigger);
      continue;
    }

    existing.push(sample);
    triggers.add(trigger);
    added.push(trigger);
  }

  setSetting("reactions", existing);

  console.log(force ? "Mode --reset : toutes les réactions ont été remplacées." : "Mode additif : les réactions existantes sont conservées.");
  console.log(`Ajoutées (${added.length}) : ${added.join(", ") || "aucune"}`);
  console.log(`Ignorées car déjà présentes (${skipped.length}) : ${skipped.join(", ") || "aucune"}`);
  console.log(`Total de réactions en base : ${existing.length}`);
}

main().catch((error) => {
  console.error("Erreur du seeder :", error.message);
  process.exit(1);
});
