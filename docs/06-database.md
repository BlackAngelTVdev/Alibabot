# Base de données

La base est un fichier **SQLite** (`users.db`) manipulé via **sql.js** : au démarrage, tout le fichier est chargé en mémoire ; à chaque modification, la base mémoire est réexportée sur le disque (`persistDatabase`).

> ⚠️ **Important** : le processus qui tourne réécrit TOUJOURS son état mémoire sur le disque. Pour modifier `users.db` à la main, il faut **arrêter le bot** d'abord, modifier, puis relancer. Sinon tes changements sont écrasés.

## Tables

### `users`
| Colonne | Type | Description |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `username` | TEXT UNIQUE | Nom du compte panneau |
| `password_hash` | TEXT | Hash **scrypt** (`sel:hash`), jamais en clair |
| `is_admin` | INTEGER (0/1) | Droits admin |
| `created_at` | TEXT | Date de création |

### `sessions`
| Colonne | Type | Description |
|---|---|---|
| `token` | TEXT PK | Jeton de session |
| `username` | TEXT | Compte associé |
| `expires_at` | INTEGER | Expiration (timestamp ms) — 12 h |

### `settings`
Clé/valeur JSON. C'est là que vit la quasi-totalité de la configuration et des données du bot.

| Clé | Type de valeur | Contenu |
|---|---|---|
| `reactions` | array | Réactions : `[{ trigger, response, variants[], count }]` |
| `user_stats` | object | Par userId : `{ userId, username, count, consent ("pending"/"yes"/"no"), anonId }` |
| `server_stats` | object | Par guildId : `{ guildId, name, count }` |
| `bot_prefix` | string | Préfixe des commandes (défaut `!`) |
| `bot_status` | object | `{ statuses: [{ activityName, activityType, presenceStatus }] }` |
| `broadcast_last` | object | Par username panneau : timestamp du dernier broadcast (limite 1/jour) |
| `champion_role_enabled` | boolean | Interrupteur global du rôle « Déclencheur du Jour » (défaut : actif) |
| `champion_role_servers` | object | Par guildId : `false` si désactivé sur ce serveur |
| `discord_links` | object | Par username panneau : `{ id, username, guilds: [{id, name}], linkedAt }` |
| `reports` | array | Reports : `[{ id, guildId, guildName, channelName, authorId, authorName, content, createdAt, resolved }]` (200 max) |
| `annual_report` | object/array | Année du dernier rapport annuel envoyé |
| `maintenance_last_run` | string | Dernière maintenance nocturne (`YYYY-MM-DD`, heure locale) |
| `quoi_variants` | array | Variantes historiques de « quoi » (migration) |

### `logs`
| Colonne | Type | Description |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `timestamp` | INTEGER | Timestamp ms |
| `username` | TEXT | Qui a fait l'action |
| `action` | TEXT | Type d'action |
| `details` | TEXT | Détails |

Rétention : **30 jours** et **1500 entrées max** (nettoyage automatique à chaque écriture — le plus restrictif des deux s'applique).

## Données volatiles (hors base)

Ces données sont **en mémoire seulement** et repartent de zéro au redémarrage (comportement voulu) :

- **Top du jour** (`src/dailyStats.js`) : total, mots et personnes du jour.
- **Champion du jour** (`src/dailyChampion.js`) : comptage par serveur/personne + qui porte actuellement le rôle.

## Migration

- Au premier démarrage, si les fichiers `quoi-variants.json` et `bot-status.json` existent, ils sont migrés dans `settings` (`quoi_variants`, `bot_status`) puis archivés en `.bak`.
- Le premier compte admin est créé depuis `.env` si la table `users` est vide.
