# Architecture

## Vue d'ensemble

```
                        ┌──────────────────────────────────────────┐
  Discord (salons/MP)   │                node src/index.js          │
  ─────────────────────►│  Client discord.js                        │
                        │     │                                     │
                        │     ├─ messageCreate → commandes / réactions│
                        │     ├─ interactionCreate → boutons/modals  │
                        │     ├─ ready → nettoyage + création rôle   │
                        │     └─ guildCreate → rôle sur nouveau srver│
                        │                                            │
                        │  startWebServer() → src/webServer.js       │
  Navigateur            │     ├─ pages statiques (public/)           │
  ─────────────────────►│     └─ API JSON /api/*                     │
                        │                                            │
                        │  modules métier (src/*.js)                 │
                        │  ───────────────────────────────────       │
                        │  reactions · userStats · dailyStats ·      │
                        │  dailyChampion · broadcast · reports ·     │
                        │  discordOAuth · annualReport · commands     │
                        │                                            │
                        │  stockage : sql.js → users.db (fichier)    │
                        └──────────────────────────────────────────┘
```

Le projet tourne **dans un seul processus** : le bot Discord et le serveur web sont lancés ensemble (`node src/index.js`). Ils partagent la même base et le même client Discord (`src/bot.js`).

## Flux de base d'un message

1. `client.on("messageCreate")` reçoit le message (`src/index.js`).
2. Si c'est un MP → gestion du consentement.
3. Si c'est une commande (`help`, `stats`, `pp`, `invite`, `consent`, `codesource`, `report`) → `src/commands.js`.
4. Sinon, `findReaction(message.content)` cherche si le message contient un déclencheur (`src/reactions.js`).
5. Si oui :
   - `incrementReactionCount` → compteur de la réaction (base) ;
   - `recordServerTrigger` → compteur par serveur (base) ;
   - `recordDailyTrigger` → top du jour (mémoire, `src/dailyStats.js`) ;
   - `recordChampionTrigger` + `refreshGuildChampion` → rôle du jour (mémoire + Discord, `src/dailyChampion.js`) ;
   - `recordUserTrigger` → compteur par personne + première demande de consentement en MP ;
   - le bot répond avec `reaction.response`.

## Les modules (`src/`)

| Fichier | Rôle |
|---|---|
| `index.js` | Point d'entrée : client Discord, événements, lancement du serveur web |
| `bot.js` | Conteneur du client Discord partagé (`setBotClient` / `getBotClient`) |
| `db.js` | Base sql.js (SQLite en mémoire → fichier `users.db`) : comptes, settings, sessions, logs |
| `reactions.js` | CRUD des réactions (déclencheur, réponse, variantes, compteur) |
| `commands.js` | Toutes les commandes texte du bot + le bouton de consentement |
| `userStats.js` | Stats par personne + consentement (pseudo ou Anonyme #N) |
| `serverStats` (dans `userStats.js`) | Stats par serveur (utilisées par le rapport annuel) |
| `dailyStats.js` | Top du jour en mémoire (mot + personne), reset à minuit |
| `dailyChampion.js` | Système de rôle « Déclencheur du Jour » (suivi en direct, création du rôle, nettoyage au restart) |
| `broadcast.js` | Construction des embeds + envoi multi-serveurs + limite quotidienne |
| `reports.js` | Rapports de problèmes (stockage, résolution, suppression) |
| `discordOAuth.js` | Connexion Discord OAuth2 pour les membres du panneau |
| `annualReport.js` | Rapport annuel du 4 mai (une seule fois par an) |
| `statusConfig.js` | Statuts du bot (activité, présence) |
| `botConfig.js` | Préfixe de commande |
| `auth.js` | Sessions web, anti-brute-force |
| `webServer.js` | Serveur HTTP : pages + API `/api/*` |
| `seed.js` | Données d'exemple |
| `resetConsent.js` | Remise à zéro des consentements |

## Frontend (`public/`)

| Fichier | Rôle |
|---|---|
| `index.html` + `app.js` | Panneau de gestion (onglets : réactions, broadcast, rôle, status, perso, reports, compte, logs) |
| `login.html` + `login.js` | Page de connexion |
| `stats.html` + `stats.js` | Page publique des statistiques (sans connexion) |
| `style.css` | Styles communs (thème sombre) |
| `role-setup.png` | Screen joint au MP du propriétaire quand la hiérarchie des rôles bloque |

**Versionnement des assets** : la version des fichiers frontend est calculée depuis leur contenu (hash) et injectée dans le HTML (`/app-vxxxx.js`) — aucun cache (navigateur ou proxy) ne peut servir un vieux script.

## Stockage

- Base **SQLite via sql.js** : tout le fichier est chargé en mémoire au démarrage, puis réécrit sur le disque (`users.db`) à chaque modification (`persistDatabase`).
- ⚠️ Conséquence : si on modifie `users.db` pendant que le bot tourne, le processus réécrit **son** état mémoire par-dessus. Pour manipuler la base à froid : arrêter le conteneur, modifier, relancer.
- Les données volatiles (top du jour, champion du jour) sont **en mémoire** : perdues au redémarrage (comportement voulu).

## Sécurité

- Sessions web 12 h, 5 tentatives de connexion ratées = blocage IP 15 min (`src/auth.js`).
- Mots de passe hachés avec **scrypt** + sel par compte (`src/db.js`).
- Accès par rôles : **admin** (tout) vs **membre** (son compte, ses serveurs via lien Discord).
- `.env` (token Discord, secret OAuth, comptes admin) et `users.db` sont exclus de git.
