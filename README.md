# AliBaBot

Bot Discord en JavaScript qui répond automatiquement à des mots déclencheurs (par défaut : `quoi` → `feur`).

## Installation

1. Installe Node.js 18+.
2. Installe les dépendances :

```bash
npm install
```

3. Crée une variable d'environnement `DISCORD_TOKEN` avec le token de ton bot Discord.
4. Active l'intent **Message Content** dans le portail développeur Discord, section **Bot** > **Privileged Gateway Intents**.
5. Protège l'interface web : ajoute dans `.env` un identifiant et un mot de passe fort pour le **premier** compte :

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=un_mot_de_passe_long_et_unique
```

Ces identifiants créent le premier utilisateur dans la base SQLite (`users.db`) au premier démarrage. Ensuite, ajoute/supprime des utilisateurs directement depuis l'interface web (section **Utilisateurs**). Sans aucun utilisateur, le serveur refuse de démarrer (sécurité).

6. Lance le bot et l'interface web :

```bash
npm start
```

7. Ouvre `http://localhost:30000` dans ton navigateur et connecte-toi avec tes identifiants. L'interface est organisée en onglets :
   - **réactions** : liste les réactions du bot (mot déclencheur + réponse). Crée-en autant que tu veux (`quoi` → `feur`, `oui` → …, `hein` → …). En cliquant sur une réaction, la réponse du bot s'affiche en gros et tu peux ajouter/supprimer les variantes qui déclenchent cette réponse ;
   - **status** : crée autant de statuts que tu veux (l'ajout est illimité) ;
   - **compte** : chacun peut y changer son propre mot de passe ; la création et la suppression des autres comptes restent réservées à l'administrateur.

## Comportement

Le bot répond à chaque message qui contient le mot déclencheur ou une de ses variantes. Par défaut, la réaction `quoi` → `feur` est pré-installée (avec toutes les variantes phonétiques historiques : `koi`, `kwa`, `koua`, `coi`…). La logique de détection est dans `src/reactions.js`, et les statuts du bot dans `src/statusConfig.js`. L'interface web permet de tout modifier en direct sur `http://localhost:30000`.

Une **page publique** `/stats` (sans connexion) affiche les déclencheurs les plus utilisés, les personnes qui déclenchent le plus et le **top du jour** (calculé en mémoire, remis à zéro à minuit). À leur premier déclenchement, chaque personne reçoit un message privé avec des **boutons** pour choisir si son pseudo peut être affiché — sinon elle apparaît en « Anonyme #N » (le numéro lui est communiqué). On peut changer d'avis à tout moment avec `[préfixe]consent` (boutons aussi). Pour repartir de zéro (tout le monde sera re-demandé) : `npm run reset-consent` (arrête le bot, exécute le script, puis relance).

Chaque réponse du bot est comptée par réaction. Le **4 mai** de chaque année, le bot envoie un **rapport annuel** sur tous les serveurs (total de déclenchements, top réaction, top personne, top serveur et remerciement) — une seule fois par an, même s'il redémarre ce jour-là.

Les commandes (préfixe modifiable dans l'onglet **perso**) :
- `[préfixe]stats` (ex. : `!stats`) : envoie le lien vers la page publique des statistiques (`PUBLIC_URL`/stats) ;
- `[préfixe]pp` (ex. : `!pp`) : envoie un lien de téléchargement de la photo de profil de l'auteur ; `[préfixe]pp @user` : celle du user taggé ;
- `[préfixe]invite` (ex. : `!invite`) : envoie un lien pour inviter le bot sur un autre serveur ;
- `[préfixe]consent` (ex. : `!consent`) : affiche son statut de consentement pour le classement public ; `[préfixe]consent oui` / `[préfixe]consent non` permet de changer d'avis à tout moment (ça marche aussi en message privé) ;
- `[préfixe]help` (ex. : `!help`) : liste toutes les commandes avec le préfixe courant ;
- `[préfixe]codesource` (ex. : `!codesource`) : lien vers le code source du bot.

### Seeder (données d'exemple)

Pour remplir la base avec des réactions d'exemple (avec compteurs déjà incrémentés pour tester `!stats`) :

```bash
npm run seed        # additif : n'écrase jamais une réaction existante
npm run seed -- --reset  # remplace TOUTES les réactions par les exemples (destructif)
```

Si tu vois l'erreur `Used disallowed intents`, c'est que l'intent **Message Content** n'est pas encore activé dans le portail Discord. Sans lui, le bot ne peut pas lire le contenu des messages et ne peut pas détecter `quoi`.

## Sécurité de l'interface web

L'interface (page + API) est protégée par une session : sans connexion, tout est refusé (les routes `/api/*` répondent `401`, les pages redirigent vers `/login`). La session expire après 12 h, et après 5 tentatives de connexion ratées l'adresse IP est bloquée 15 minutes (anti-brute-force).

Tout est stocké dans une base **SQLite** (`users.db`, via `sql.js` — aucun serveur de base de données requis) : les comptes, les réactions du bot et les statuts du bot. Les mots de passe sont hachés avec **scrypt** (sel unique par compte). Au premier démarrage, l'ancien contenu de `quoi-variants.json` et `bot-status.json` est migré automatiquement dans la base (les fichiers d'origine sont archivés en `.bak`), et les variantes de « quoi » deviennent la réaction `quoi` → `feur`. L'admin peut créer, modifier et supprimer des comptes (impossible de supprimer son propre compte ni le dernier compte).
