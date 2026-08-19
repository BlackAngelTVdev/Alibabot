# AliBaBot — Documentation

Bot Discord en **JavaScript (Node.js)** qui répond automatiquement à des mots déclencheurs (par défaut `quoi` → `feur`), avec un **panneau web** de gestion, des **statistiques publiques**, un système de **récompense par rôle** et des **signalisations de problèmes**.

## En une phrase

> Un message contient `quoi` → le bot répond `feur`. Tout le reste (gestion, stats, rôles, rapports) est construit autour de ce principe.

## Les 3 parties du projet

| Partie | C'est quoi | Où |
|---|---|---|
| **Le bot Discord** | Écoute les messages, répond aux déclencheurs, gère les commandes, attribue le rôle du jour | `src/` (processus principal `src/index.js`) |
| **Le panneau web** | Interface de gestion : réactions, statuts, broadcast, compte, perso, rôle, reports, logs | `public/` (frontend) + routes API dans `src/webServer.js` |
| **La page publique `/stats`** | Classements visibles sans connexion (déclencheurs, personnes, top du jour) | `public/stats.html` + `public/stats.js` |

## Navigation

- [01 — Architecture et modules](01-architecture.md)
- [02 — Installation et configuration](02-setup.md)
- [03 — Commandes Discord](03-commands.md)
- [04 — Panneau web](04-web-panel.md)
- [05 — Fonctionnalités](05-features.md)
- [06 — Base de données](06-database.md)
- [07 — Déploiement (Docker)](07-deploy.md)

## Commandes rapides

```bash
npm install          # installe les dépendances
npm start            # lance le bot + le panneau web (port 30000)
npm test             # lance les tests (node --test)
npm run seed         # ajoute des réactions d'exemple
npm run reset-consent # remet tous les consentements à zéro
```

## Terminologie

- **Déclencheur / trigger** : le mot (ou variante) qui fait répondre le bot (`quoi`, `koi`, `kwa`…).
- **Réponse** : ce que le bot envoie (`feur`).
- **Réaction** : le couple déclencheur → réponse, avec ses variantes.
- **Broadcast** : envoi d'un embed (avec boutons) sur un ou plusieurs serveurs.
- **Déclencheur du Jour** : la personne qui a le plus fait répondre le bot aujourd'hui, récompensée d'un rôle.
