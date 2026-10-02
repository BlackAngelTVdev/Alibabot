import { addLog, deleteExpiredSessions, getSetting, runDbMaintenance, setSetting } from "./db.js";
import { rebuildReactionIndex } from "./reactions.js";

// Maintenance nocturne (00h00 locale, quand le bot est peu utilisé) :
//  - reconstruit l'index des déclencheurs (fraîcheur après une écriture directe en base) ;
//  - ANALYZE (stats du planificateur SQLite) + VACUUM (compactage) + réécriture du fichier ;
//  - purge les sessions expirées ;
//  - journalise le passage dans les logs du panneau.

const LAST_RUN_KEY = "maintenance_last_run";

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNumber = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNumber}`;
}

export function runMaintenance() {
  const startedAt = Date.now();

  // 1. Index des déclencheurs : reconstruit depuis la base.
  const index = rebuildReactionIndex();
  const indexedWords = index.wordToReaction.size;

  // 2. Base : ANALYZE + VACUUM (compactage) + réécriture du fichier.
  runDbMaintenance();

  // 3. Nettoyage : sessions expirées.
  deleteExpiredSessions();

  // 4. Marqueur de dernière exécution (clé jour locale).
  const day = localDayKey(new Date());
  setSetting(LAST_RUN_KEY, day);

  const summary = { day, indexedWords, durationMs: Date.now() - startedAt, at: new Date().toISOString() };
  addLog("system", "maintenance", JSON.stringify(summary));
  return summary;
}

// Planifie la maintenance chaque nuit à 00h00 locale (heure de la machine).
// Au démarrage, si elle n'a pas déjà tourné aujourd'hui, on la lance une fois :
// l'index des déclencheurs est ainsi frais dès le lancement (même après un seed
// qui aurait écrit la clé « reactions » directement en base).
export function scheduleMaintenance() {
  const run = () => {
    try {
      const summary = runMaintenance();
      console.log(`Maintenance nocturne terminée (${summary.indexedWords} mots indexés en ${summary.durationMs} ms).`);
    } catch (error) {
      console.error("Maintenance nocturne :", error.message);
    }
  };

  if (getSetting(LAST_RUN_KEY) !== localDayKey(new Date())) {
    run();
  }

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0); // 00h00 du jour suivant
  const delay = Math.max(nextMidnight.getTime() - now.getTime(), 1000);

  // .unref() : les timers ne doivent pas empêcher le processus de s'arrêter proprement
  // (le bot est de toute façon maintenu en vie par la connexion au gateway Discord).
  const timer = setTimeout(() => {
    run();
    const interval = setInterval(run, 24 * 60 * 60 * 1000);
    interval.unref();
  }, delay);
  timer.unref();
}
