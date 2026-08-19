# 🚀 AliBaBot

![Stars](https://img.shields.io/github/stars/BlackAngelTVdev/Alibabot?style=for-the-badge&color=yellow)
![Commits](https://img.shields.io/github/commit-activity/m/BlackAngelTVdev/Alibabot?style=for-the-badge&color=blue)
![Issues](https://img.shields.io/github/issues/BlackAngelTVdev/Alibabot?style=for-the-badge&color=orange)
![Forks](https://img.shields.io/github/forks/BlackAngelTVdev/Alibabot?style=for-the-badge&color=808080)
![Last Commit](https://img.shields.io/github/last-commit/BlackAngelTVdev/Alibabot?style=for-the-badge&color=blue)

> **Bot Discord qui répond « feur » aux « quoi » — avec un panneau web complet pour tout gérer : réactions, stats, broadcasts, rôles et signalements.**
> *Exemple : tape `quoi` dans un salon et le bot répond `feur`. Ajoute tes propres mots déclencheurs depuis le panneau.*

---

## 🧐 Aperçu

Le bot tourne sur Discord (réponses automatiques + commandes) et s'accompagne d'un **panneau web** de gestion, d'une **page publique de statistiques** (`/stats`) et d'un système de **récompense par rôle** pour le plus gros déclencheur de la journée.

📚 **Documentation complète** : [`docs/`](docs/00-index.md) — architecture, installation, commandes, panneau web, base de données et déploiement Docker.

## ✨ Fonctionnalités

- ✅ **Réactions personnalisables** : crée des mots déclencheurs (avec variantes) et leurs réponses directement dans le panneau.
- ✅ **Statistiques + consentement** : chaque déclenchement est compté (par mot, par personne, par serveur), avec classements publics respectant l'anonymat choisi par chacun.
- ✅ **Rôle « 👑 Déclencheur du Jour »** : la personne qui déclenche le plus dans la journée reçoit un rôle coloré, suivi en direct et activable/désactivable serveur par serveur.
- ✅ **Broadcast visuel** : construit des embeds (avec boutons et champs) et envoie-les sur tous tes serveurs — limité à ses serveurs pour les membres, illimité pour l'admin.
- ✅ **Signalements (`!!report`)** : un popup Discord pour remonter un problème, consultable dans le panneau.
- ✅ **Connexion Discord OAuth** : les membres ne voient que les serveurs où ils sont réellement.
- ✅ **Rapport annuel automatique** le 4 mai, statuts du bot en rotation, photo de profil modifiable, et plus encore.

## 🛠 Tech Stack

| Technologie | Usage |
| :--- | :--- |
| ![JavaScript](https://img.shields.io/badge/JavaScript-Node.js-yellow?style=flat-square) | Logique principale (bot + serveur web) |
| ![discord.js](https://img.shields.io/badge/discord.js-v14-blue?style=flat-square) | Interface Discord (messages, modals, boutons, rôles) |
| ![sql.js](https://img.shields.io/badge/Database-sql.js-green?style=flat-square) | Stockage SQLite (fichier `users.db`) |
| ![HTML/CSS](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-orange?style=flat-square) | Panneau web + page publique des stats |
| ![Docker](https://img.shields.io/badge/Deploy-Docker-blue?style=flat-square) | Mise en production (docker-compose) |

## 🚀 Installation & Lancement

1. **Cloner le projet**
   ```bash
   git clone https://github.com/BlackAngelTVdev/Alibabot.git
   cd Alibabot
   ```
2. **Installer les dépendances**
   ```bash
   npm install
   ```
3. **Configurer les variables d'environnement**
   Créez un fichier `.env` à la racine et ajoutez vos clés (voir [`docs/02-setup.md`](docs/02-setup.md) pour le détail) :
   ```
   DISCORD_TOKEN=ton_token_de_bot
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=un_mot_de_passe_fort
   PUBLIC_URL=https://quoi.laxacube.ch
   ```
   Active les intents **Message Content** et **Server Members** dans le portail développeur Discord.
4. **Lancer l'application**
   ```bash
   npm start
   ```
   Le panneau web est alors sur **http://localhost:30000**.

## 📖 Utilisation

- Sur Discord : tape `quoi` pour voir le bot répondre `feur`, ou `!!help` pour lister toutes les commandes (`!!stats`, `!!pp`, `!!invite`, `!!report`, `!!consent`, `!!codesource`).
- Dans le panneau : crée des réactions, des statuts, des broadcasts, gère les comptes et le rôle « Déclencheur du Jour ».
- Page publique : `PUBLIC_URL/stats` pour les classements et le top du jour, sans connexion.

```
// Petit snippet de code d'exemple
const { findReaction } = await import('./src/reactions.js');
findReaction('quoi'); // → { trigger: 'quoi', response: 'feur', count: … }
```

## 🤝 Contribution

1. Forkez le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add some AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 👤 Auteur

**BlackAngelTVdev**
![Follow](https://img.shields.io/github/followers/BlackAngelTVdev?label=Follow%20Me&style=social)

---
## 📄 Licence

Ce projet est sous licence :
![GitHub License](https://img.shields.io/github/license/BlackAngelTVdev/Alibabot?style=flat-square&color=blue)

### 🧑‍💻 Contributors

Merci à toutes les personnes qui contribuent au projet.

[![Contributors](https://contrib.rocks/image?repo=BlackAngelTVdev/Alibabot)](https://github.com/BlackAngelTVdev/Alibabot/graphs/contributors)
