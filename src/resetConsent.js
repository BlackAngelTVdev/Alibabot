import { initDb } from "./db.js";
import { clearUserStats } from "./userStats.js";

// Remet à zéro le suivi des utilisateurs (classement public) :
// tout le monde sera re-demandé (avec boutons) au prochain déclenchement.
async function main() {
  await initDb();
  const removed = clearUserStats();
  console.log(`Suivi utilisateur vidé : ${removed} entrée(s) supprimée(s).`);
  console.log("Tout le monde recevra à nouveau la demande de consentement (avec boutons) au prochain déclenchement.");
}

main().catch((error) => {
  console.error("Erreur :", error.message);
  process.exit(1);
});
