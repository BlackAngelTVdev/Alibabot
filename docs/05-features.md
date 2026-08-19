# Fonctionnalités

## 1. Réactions (mots déclencheurs)

Le cœur du bot : un message contenant un déclencheur (ou une variante) → le bot répond.

- Stockées en base (`settings.reactions`), gérables dans l'onglet **réactions**.
- Chaque réaction a : `trigger` (mot principal), `response`, `variants` (autres mots), `count` (nombre de réponses).
- Le mot déclencheur lui-même compte toujours.
- Détection dans `src/reactions.js` (normalisation des accents, insensible à la casse).

## 2. Statistiques et consentement

- **Par réaction** : compteur `count` en base.
- **Par personne** : `user_stats` (userId → { count, consent, anonId }) — le consentement (pseudo affiché ou « Anonyme #N ») est demandé au premier déclenchement via un **MP avec boutons**, modifiable avec `!!consent`.
- **Par serveur** : compté aussi, utilisé par le rapport annuel.
- **Page publique `/stats`** (sans connexion) : classements des déclencheurs et des personnes + **🔥 Top du jour**.

### Top du jour (`src/dailyStats.js`)
- Calculé **en mémoire**, remis à zéro à minuit.
- « ⚡ Mot du jour » et « 👤 Personne du jour » (respect du consentement).
- ⚠️ Perdu si le bot redémarre (comportement assumé, noté sur la page).

## 3. 👑 Déclencheur du Jour (rôle)

La personne qui a **le plus déclenché aujourd'hui** sur un serveur porte le rôle **« 👑 Déclencheur du Jour »** (couleur or, affiché à part dans la liste des membres → pseudo coloré).

- **Suivi en direct** : à chaque déclenchement, si le leader change, le rôle change de main (retiré à l'ancien, donné au nouveau).
- **Création automatique** : au démarrage du bot et à l'arrivée sur un nouveau serveur, le rôle est créé s'il n'existe pas (couleur or, hoist).
- **Fin de journée / redémarrage** : le rôle est retiré et le comptage repart de zéro (tout est en mémoire).
- **Hiérarchie des rôles** : si le rôle du bot est trop bas (ou permission « Gérer les rôles » absente), le bot envoie un **MP au propriétaire** avec un screen (`public/role-setup.png`) expliquant de mettre les 2 rôles tout en haut.
- **Activation/désactivation** :
  - Global (admin) : interrupteur dans l'onglet **perso** ;
  - Par serveur : onglet **👑 rôle** (admin : tous les serveurs ; membre : ses serveurs).
  - Désactiver retire le rôle sur place et arrête le suivi ; réactiver recrée le rôle.
- Réglages persistés en base : `champion_role_enabled` (global) et `champion_role_servers` (par serveur).

## 4. Broadcast (embeds)

- Constructeur d'embed visuel dans l'onglet **📣 broadcast** : titre, couleur, auteur, description, image, miniature, footer, champs inline, boutons (5 styles dont lien).
- Envoi sur **tous les serveurs** ou un **serveur précis**.
- Salon cible : salon système → sinon « general » → sinon le premier salon où le bot peut écrire.
- **Limites** : membres = 1/jour sur leurs serveurs ; admins = illimité. Le quota n'est consommé que si un envoi réussit.
- Les boutons non-lien accusent juste réception du clic (aucune action pour l'instant).

## 5. 📨 Reports (signalements)

- Commande `!!report` → popup (modal) → message envoyé au panneau (onglet **📨 reports**).
- Contenu : auteur (pseudo Discord), serveur, salon, date, message.
- Visibilité : admin = tous ; membre = ceux des serveurs où il est (via lien Discord).
- Actions : marquer **résolu/rouvert**, **supprimer** (admin ou auteur).
- Garde-fou : 200 reports max en base.

## 6. Connexion Discord des membres (OAuth2)

- Après login, chaque membre connecte son compte Discord (bannière dans le panneau).
- Résultat : il ne voit que les **serveurs où il est et où le bot est** (broadcast, rôle, reports).
- L'admin n'a pas besoin de se connecter (accès complet).
- Lien persisté par utilisateur dans `settings.discord_links`.

## 7. Rapport annuel (4 mai)

- Chaque **4 mai**, le bot envoie un **gros rapport** sur tous les serveurs : total de déclenchements, mot le plus déclenché, personne qui déclenche le plus (respect du consentement), serveur le plus actif, remerciement.
- **Une seule fois par an** : l'année du dernier envoi est mémorisée (aucun doublon même après redémarrages).
- Vérifié 30 s après le démarrage puis toutes les heures.

## 8. Statuts du bot

- Plusieurs statuts qui défilent toutes les 10 secondes (activité + présence).
- Gérables dans l'onglet **status** (illimité).
- La mention « développé par BlackAngelTVdev · https://github.com/BlackAngelTVdev » est toujours dans la rotation (Discord interdit aux bots de modifier leur bio).

## 9. Favicon = avatar du bot

- Le site (panneau + pages publiques) utilise l'**avatar actuel du bot** comme favicon : `/favicon` redirige vers le CDN Discord, donc si on change la pdp, le favicon suit.
