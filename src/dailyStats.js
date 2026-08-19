import { getUserStat } from "./userStats.js";

// Suivi « top du jour » entièrement en mémoire (aucune base de données) :
// remis à zéro automatiquement à minuit. Perdu si le bot redémarre — assumé.

let currentDayKey = null;
let day = null;

function dayKeyOf(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNumber = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNumber}`;
}

function ensureDay(key) {
  if (currentDayKey !== key) {
    currentDayKey = key;
    day = { key, triggers: new Map(), users: new Map(), total: 0 };
  }
  return day;
}

// Enregistre un déclenchement pour aujourd'hui (ou pour la date fournie, pour les tests).
export function recordDailyTrigger(trigger, response, user, date = new Date()) {
  const key = dayKeyOf(date);
  const current = ensureDay(key);

  current.total += 1;

  const triggerEntry = current.triggers.get(trigger) ?? { trigger, response, count: 0 };
  triggerEntry.count += 1;
  triggerEntry.response = response ?? triggerEntry.response;
  current.triggers.set(trigger, triggerEntry);

  const userEntry = current.users.get(user.id) ?? { userId: user.id, username: user.username, count: 0 };
  userEntry.count += 1;
  userEntry.username = user.username ?? userEntry.username;
  current.users.set(user.id, userEntry);

  return current;
}

// Stats d'aujourd'hui : total, déclencheurs triés, utilisateurs triés (respect du consentement).
export function dailyStats(date = new Date()) {
  const key = dayKeyOf(date);
  ensureDay(key);

  const triggers = [...day.triggers.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ trigger, response, count }) => ({ trigger, response, count }));

  const users = [...day.users.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ userId, username, count }) => {
      const entry = getUserStat(userId);
      const display =
        entry?.consent === "yes"
          ? (entry.username ?? username)
          : `Anonyme #${entry?.anonId ?? "?"}`;
      return { display, count };
    });

  return { date: key, total: day.total, triggers, users };
}
