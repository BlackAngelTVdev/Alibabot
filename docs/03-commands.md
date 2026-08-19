# Commandes Discord

Toutes les commandes commencent par le **préfixe** configuré dans l'onglet **perso** du panneau (défaut : `!`). Le préfixe courant est toujours utilisé dans l'aide.

> Exemples ci-dessous avec le préfixe `!!` (celui actuellement en place).

## Liste des commandes

| Commande | Description |
|---|---|
| `!!help` | Liste toutes les commandes avec le préfixe courant |
| `!!stats` | Envoie le lien vers la page publique des statistiques (`PUBLIC_URL/stats`) |
| `!!pp` | Lien de téléchargement de ta photo de profil |
| `!!pp @user` | Lien de téléchargement de la photo du user taggé |
| `!!invite` | Lien pour inviter le bot sur un autre serveur |
| `!!report` | Ouvre un popup (modal) pour signaler un problème → envoyé au panneau (onglet reports) |
| `!!consent` | Affiche ton statut de consentement pour le classement public, avec boutons |
| `!!consent oui` / `!!consent non` | Change ton choix immédiatement (marche aussi en MP, ainsi que `yes`/`no`) |
| `!!codesource` | Lien vers le code source du bot (GitHub) |

## Détails

### `!!stats`
- Renvoie un embed « 📊 Statistiques des réactions » avec le lien `quoi.laxacube.ch/stats` (cliquable).
- Si `PUBLIC_URL` n'est pas configuré : message d'information, pas de lien.

### `!!pp`
- Sans mention : ta photo. Avec mention : celle du user taggé.
- Renvoie un embed avec l'image et un lien de téléchargement.

### `!!invite`
- Lien d'invitation avec les permissions demandées par le bot (voir `INVITE_PERMISSIONS` dans `src/commands.js`).
- Affiche le **nom actuel** du bot dans le titre.

### `!!report`
1. Le bot répond avec un bouton rouge « 📝 Signaler un problème ».
2. Clic → un **popup (modal)** s'ouvre avec un champ « Décris ton problème ou ta remarque » (10 à 1500 caractères).
3. Validation → confirmation éphémère, et le report est enregistré (auteur, serveur, salon, date, contenu).
4. Le report apparaît dans le panneau → onglet **📨 reports** (admin : tous ; membre : ceux de ses serveurs).

### `!!consent`
- Sans argument : affiche ton statut (pseudo affiché / Anonyme #N / en attente) avec deux boutons **✅ Oui** / **🙈 Non**.
- Avec argument : change l'avis immédiatement (`oui`/`non`, ou `yes`/`no`).
- La première fois qu'on déclenche le bot, un **MP avec boutons** demande aussi le consentement. Sans réponse → affiché en « Anonyme #N ».

### `!!codesource`
- Renvoie le lien du dépôt `github.com/BlackAngelTVdev/Alibabot` (cliquable).

## Réponses automatiques

En plus des commandes, le bot répond automatiquement aux **déclencheurs** :
- `quoi` → `feur` (avec toutes les variantes phonétiques : `koi`, `kwa`, `koua`, `coi`…).
- Toute réaction créée dans le panneau (onglet **réactions**) avec ses variantes.

Le mot déclencheur lui-même compte toujours (plus besoin de l'ajouter en variante).
