# Installation et configuration

## Prérequis

- Node.js **18.17+**
- Un compte/bot Discord (portail développeur)
- (Optionnel) Docker pour la mise en production

## Installation locale

```bash
npm install
```

## Variables d'environnement (`.env`)

Copie le fichier et remplis les valeurs :

```bash
# Obligatoire — token du bot Discord (portail développeur → Bot → Token)
DISCORD_TOKEN=…

# Obligatoire au premier démarrage — crée le premier compte (admin) dans users.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=un_mot_de_passe_long_et_unique

# Optionnel — URL publique (ex. https://quoi.laxacube.ch) :
# sert au lien des stats dans !!stats / !!help et à l'URL de callback OAuth
PUBLIC_URL=https://quoi.laxacube.ch

# Optionnel — connexion Discord des membres du panneau (voir plus bas)
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Sans `DISCORD_TOKEN`, le bot refuse de démarrer. Sans `ADMIN_USERNAME`/`ADMIN_PASSWORD`, la base n'a aucun compte et le serveur web refuse de démarrer (sécurité).

## Intents Discord (portail développeur → Bot → Privileged Gateway Intents)

Le bot a besoin de **deux intents privilégiés** :

1. **Message Content Intent** — lire le contenu des messages (détecter `quoi`, commandes).
2. **Server Members Intent** — récupérer les membres (nécessaire pour le rôle « Déclencheur du Jour »).

S'ils ne sont pas cochés, le bot refuse de se connecter avec le message :
> *« Discord refuse la connexion : un intent privilégié n'est pas activé… »*

## Connexion Discord des membres (OAuth2, optionnel)

Pour que les **membres** (non-admin) du panneau ne voient que **leurs serveurs** (broadcast, onglet rôle, reports), chaque membre connecte son compte Discord :

1. Portail développeur → ton application → **OAuth2 → General** : note le **Client ID** et crée un **Client Secret**.
2. Dans **OAuth2 → Redirects**, ajoute :
   - `<PUBLIC_URL>/api/oauth/callback` (ex. `https://quoi.laxacube.ch/api/oauth/callback`) ;
   - `http://localhost:30000/api/oauth/callback` (test en local).
3. Renseigne dans `.env` :
   ```bash
   DISCORD_CLIENT_ID=…
   DISCORD_CLIENT_SECRET=…
   ```
4. Redémarre le bot. Dans le panneau, une bannière « 🔗 Connecte ton compte Discord » apparaît pour les membres.

**Sans OAuth configuré** : l'admin garde tout, les membres voient une bannière « Connexion Discord non configurée ».

## Permissions du bot sur un serveur

Pour répondre correctement et gérer le rôle « Déclencheur du Jour », le bot a besoin de :

- Lire et envoyer des messages, voir l'historique ;
- Joindre des fichiers et des embeds (liens) ;
- Ajouter des réactions ;
- **Gérer les rôles** (pour créer/attribuer le rôle du jour).

Si la permission « Gérer les rôles » manque (ou si le rôle du bot est trop bas dans la hiérarchie), le bot envoie un **MP au propriétaire du serveur** avec un screen explicatif (`public/role-setup.png`) : il faut mettre les 2 rôles (le sien + « 👑 Déclencheur du Jour ») tout en haut de la liste des rôles.

## Lancement

```bash
npm start        # bot + panneau web
# ou
npm run dev      # avec rechargement automatique (nodemon)
```

Le panneau est disponible sur **http://localhost:30000** (port modifiable via `PORT`).

## Seeder (données d'exemple)

```bash
npm run seed              # additif : n'écrase jamais une réaction existante
npm run seed -- --reset   # remplace TOUTES les réactions par les exemples
```

## Remise à zéro des consentements

```bash
npm run reset-consent
```

> ⚠️ Arrête le bot avant (la base est réécrite par le processus en cours), exécute le script, puis relance.
