# Déploiement (Docker)

Le projet s'exécute aussi dans un conteneur Docker (image `node:20-slim`), via `docker-compose.yml`.

## Structure

- Le dossier du projet est **monté en volume** dans `/app` : le code est lu en direct depuis l'hôte — pour déployer une modification, il suffit de **redémarrer** le conteneur (`docker restart node_app`), pas de reconstruire.
- ⚠️ Sauf pour les **variables d'environnement** : celles-ci sont injectées au lancement. Si tu modifies `.env` (ajout/suppression de clés), il faut **recréer** le conteneur :
  ```bash
  docker compose up -d --force-recreate
  ```
- Les fichiers générés (`users.db`) sont écrits dans le volume → persistés entre les redémarrages.

## Commandes courantes

```bash
docker restart node_app                    # redéploiement du code (volume)
docker compose up -d --force-recreate      # après un changement de .env
docker logs --tail 50 node_app             # logs
```

## Environnement injecté

Depuis `.env` (passées par `docker-compose.yml`) :

| Variable | Rôle |
|---|---|
| `ADMIN_USERNAME` | Premier compte admin |
| `ADMIN_PASSWORD` | Mot de passe du premier compte admin |
| `PUBLIC_URL` | URL publique (stats, callback OAuth) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth Discord des membres |

`DISCORD_TOKEN` est lu par `dotenv` **au runtime** depuis le `.env` monté dans le conteneur (pas besoin de le passer dans le compose).

## Ports

- **30000** → panneau web + API (exposé sur `http://localhost:30000`, ou derrière le proxy Cloudflare/Nginx qui pointe vers `PUBLIC_URL`).

## Redémarrage et données volatiles

- Au redémarrage, le bot :
  1. retire le rôle « Déclencheur du Jour » à tout le monde (s'il y en a) ;
  2. remet à zéro le comptage du jour (top du jour + champion) ;
  3. recrée le rôle sur les serveurs actifs ;
  4. vérifie si le rapport annuel (4 mai) doit partir.
- Les comptes, réactions, consentements, reports et réglages sont **persistés** (base sur disque).

## Procédure de mise à jour type

```bash
# 1. (optionnel) backup de la base
cp users.db users.db.bak

# 2. redéploiement du code
docker restart node_app

# 3. vérification
docker logs --tail 20 node_app
#   → « Connecté en tant que Koifeur#3694 — 3 serveur(s) en cache »
#   → « Interface web disponible sur http://localhost:30000 »
```

## Problèmes connus

| Symptôme | Cause | Solution |
|---|---|---|
| « Discord refuse la connexion : un intent privilégié… » | Intent Message Content ou Server Members pas activé | Portail dev → Bot → Privileged Gateway Intents |
| Rôle « Déclencheur du Jour » non créé sur un serveur | Permission « Gérer les rôles » absente | MP du propriétaire reçu avec screen ; donner la permission / remonter les rôles |
| `.env` modifié mais rien ne change | Variables injectées au lancement | `docker compose up -d --force-recreate` |
| Panneau cassé après une mise à jour | Ancien JS en cache | Ctrl+F5 (ou les assets versionnés se rafraîchissent d'eux-mêmes) |
