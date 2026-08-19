# Panneau web

Le panneau est accessible sur **http://localhost:30000** (ou `PUBLIC_URL` en production). Il faut se connecter avec un compte du panneau (le premier est créé depuis `.env`).

## Onglets

| Onglet | Accès | Description |
|---|---|---|
| 💬 **réactions** | Tous | Créer/gérer les mots déclencheurs et leurs réponses |
| 📣 **broadcast** | Tous | Construire un embed (avec boutons) et l'envoyer sur des serveurs |
| 👑 **rôle** | Tous | Activer/désactiver le rôle « Déclencheur du Jour » serveur par serveur |
| 🔄 **status** | Tous | Gérer les statuts/activités du bot |
| 🎨 **perso** | Tous | Photo de profil, pseudo, préfixe + interrupteur global du rôle (admin) |
| 📨 **reports** | Tous | Problèmes signalés via `!!report` sur Discord |
| 👥 **compte** | Tous | Changer son mdp ; gérer les autres comptes (admin) |
| 📜 **logs** | Admin | Journal des actions (100 dernières) |

## Connexion Discord des membres

- **Admin** : aucun lien Discord requis — voit **tous** les serveurs et tout le panneau.
- **Membre** : doit connecter son compte Discord (bannière bleue en haut) pour voir **ses serveurs**. Sans lien : broadcast, rôle et reports lui demandent de se connecter.

## Détail des onglets

### 💬 Réactions
- Formulaire en haut : mot déclencheur + réponse → **Créer la réaction**.
- Chaque ligne se déplie : réponse en **gros**, bouton « Changer la réponse », liste des **variantes** (avec suppression), champ pour en ajouter, et bouton « Supprimer cette réaction ».
- Le compteur de réponses par réaction est visible sur chaque ligne.

### 📣 Broadcast
- Construis un embed : titre, couleur, auteur, description, image, miniature, footer, **champs** (avec inline) et **boutons** (5 styles, dont « lien » avec URL).
- Aperçu Discord en direct à droite.
- **Où l'envoyer ?** : tous les serveurs (visibles pour toi) ou un serveur précis.
- **Limites** : membres = 1 envoi/jour, uniquement sur leurs serveurs. Admins = illimité.
- Le quota n'est consommé que si au moins un serveur a réellement reçu le message.

### 👑 Rôle (Déclencheur du Jour)
- Liste des serveurs avec un **switch** chacun (voir [05-features.md](05-features.md) pour le détail du système).
- Membre : uniquement ses serveurs. Admin : tous + interrupteur global dans 🎨 perso.

### 🎨 Perso
- **Photo de profil** : choisir une image → « Changer la pdp » (5 Mo max).
- **Pseudo** : renommer le bot (2 à 32 caractères).
- **Préfixe** : changer le préfixe des commandes (1 à 5 caractères).
- **Interrupteur global « Déclencheur du Jour »** (admin) : coupe/relance le système sur tous les serveurs à la fois.
- Note : Discord ne permet pas aux bots de modifier leur bio → la mention de développement reste dans la rotation des statuts.

### 📨 Reports
- Liste des signalements : serveur, auteur, date, salon, contenu.
- Actions : **Résolu / Rouvrir**, **Supprimer** (admin ou auteur du report).

### 👥 Compte
- **Membre** : change son propre mot de passe.
- **Admin** : crée/supprime des comptes, change les mots de passe des autres. Impossible de supprimer son propre compte ni le dernier compte.

### 📜 Logs (admin)
- Connexions, réactions, statuts, broadcast, comptes, perso, reports — les 100 dernières actions, conservées 30 jours max.

## Notes techniques

- **Session** : 12 h ; 5 échecs de connexion = IP bloquée 15 min.
- **URL avec onglet** : chaque onglet a un hash (`#broadcast`, `#role`…) → un F5 retombe sur le même onglet.
- **Cache** : les fichiers JS/CSS sont versionnés automatiquement (hash du contenu) → un simple F5 suffit après une mise à jour (Ctrl+F5 en cas de doute).
