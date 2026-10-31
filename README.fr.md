# NMOS Express

<p align="center">
  <img src="images/nmos-express-transparent-white.png" alt="Logo NMOS Express" width="420" />
</p>

<p align="center">
  <strong>Interface Web légère, matrice de routage et simulateur de nœuds virtuels pour SMPTE ST 2110 & AMWA NMOS (IS-04 / IS-05), utilisable 100 % hors-ligne.</strong>
</p>

<p align="center">
  <strong>🇫🇷 Français</strong> &nbsp;|&nbsp; <a href="README.md">🇬🇧 Read in English</a>
</p>

---

## 📌 Présentation

**NMOS Express** est une application web open source conçue pour les régies de production, cars régie (OB vans), studios live et laboratoires utilisant des infrastructures audiovisuelles sur IP **SMPTE ST 2110**.

Elle offre une interface intuitive et réactive pour découvrir les équipements NMOS, gérer des étiquettes d'exploitation personnalisées, commuter des flux vidéo/audio/data via un graphe visuel ou une grille matricielle, orchestrer des équipements virtuels multi-essences, automatiser des salves de commutation et simuler des nœuds NMOS réalistes sans aucun matériel physique.

### Points forts

- **100 % Hors-ligne (*Air-Gapped*)** : Aucun appel vers des CDN externes, polices web ou services cloud. Conçu pour fonctionner sur des réseaux de diffusion et de production strictement isolés.
- **Sans base de données lourde** : L'état et la configuration sont stockés dans des fichiers JSON standards et lisibles (aucun serveur SQL ou Redis requis).
- **Conformité AMWA NMOS** : Support complet des spécifications **IS-04** (Découverte & Enregistrement v1.0 à v1.3) et **IS-05** (Gestion des connexions / commutations v1.0 et v1.1).
- **Contrôle de compatibilité SDP** : Moteur d'analyse temps réel vérifiant les profils SDP (1080i50, 1080p, échantillonnage audio, packet time) avant commutation pour empêcher tout routage incompatible sur les récepteurs.
- **Simulateur multi-nœuds intégré** : Script Python autonome sans dépendance externe simulant 5 nœuds concurrents avec génération dynamique de flux SDP pour tester immédiatement en local.
- **Boîtes de dialogue & Toasts modernes** : Remplacement des `alert()` et `confirm()` natifs bloquants par des fenêtres modales asynchrones soignées avec raccourcis clavier (Échap / Entrée).
- **Interface multilingue** : Entièrement traduite en français, anglais et italien.

---

## 🖥️ Description détaillée des modules

NMOS Express est composé de 8 modules web spécialisés, chacun dédié à un besoin opérationnel précis en régie broadcast :

### 1. Matrice de routage (`index.html`)
La grille de commutation principale pour la distribution rapide des signaux en direct.
- **Fonctionnement général** : Présente les sources (Émetteurs / *Senders*) et les destinations (Récepteurs / *Receivers*) sous forme d'une grille matricielle XY. Un clic sur une intersection arme et exécute immédiatement la connexion IS-05.
- **Caractéristiques techniques & opérationnelles** :
  - Organisation par onglets d'équipements (*SNP-GATEWAY*, *RossRx*, *Neuron*, etc.).
  - Sélecteur de type d'essence : Vidéo, Audio, Data, ou Tous.
  - Dépliage/repliage des groupes d'équipements pour naviguer facilement dans les architectures denses.
- **Fonctionnalités clés** :
  - Visualisation des routes actives en temps réel par pastille verte au point de croisement.
  - Vérification pré-commutation du profil SDP : bloque ou avertit avant commutation en cas d'incompatibilité de format.
  - Bouton de déconnexion rapide (*unpark*) par récepteur.
  - Barre de recherche instantanée par libellé ou identifiant de flux.

### 2. Graphe interactif NMOS (`nmos_graph.html`)
Représentation topologique interactive du cheminement physique et logique des signaux dans l'infrastructure.
- **Fonctionnement général** : Organise automatiquement les équipements en 3 colonnes fonctionnelles :
  - **Colonne de gauche** : Sources primaires / Émetteurs.
  - **Colonne centrale** : Équipements de traitement et hybrides (ex: mélangeurs vidéo, processeurs de couleur, grilles multiviewer).
  - **Colonne de droite** : Destinations finales / Récepteurs.
- **Caractéristiques techniques & opérationnelles** :
  - Courbes de Bézier SVG dynamiques reliant en temps réel les abonnements actifs.
  - Infobulles techniques au survol (adresse IP multicast, port, format RTP, profil SDP).
- **Fonctionnalités clés** :
  - **Mode commutation intelligente** : Cliquer sur une destination active le mode commutation, met en surbrillance les sources compatibles et masque temporairement les types non pertinents (ex: audio et data masqués lors du routage d'un flux vidéo).
  - **Badge de statut en haut d'écran** : Affiche un badge interactif (*"Mode commutation Vidéo"*) avec un bouton d'annulation en 1 clic pour réafficher l'ensemble des flux.
  - Recherche d'équipements et réorganisation dynamique de l'affichage.

### 3. Graphe des périphériques virtuels (`nmos_graph_virtual.html`)
Topologie visuelle dédiée au routage des flux groupés multi-essences.
- **Fonctionnement général** : Visualise les équipements virtuels de production (faisceaux combinés Vidéo + Audio + Data) plutôt que les flux élémentaires isolés.
- **Caractéristiques techniques & opérationnelles** :
  - Ligne de liaison unique représentant l'ensemble du faisceau audiovisuel complet.
- **Fonctionnalités clés** :
  - Commutation virtuelle directe en un clic sur le graphe.
  - Diagnostic immédiat des récepteurs physiques associés à chaque source virtuelle de production.

### 4. Gestionnaire d'étiquettes & Profils SDP (`labels.html`)
Centre de nommage opérationnel et de diagnostic des flux ST 2110.
- **Fonctionnement général** : Permet aux exploitants d'attribuer des étiquettes de production claires (ex: *"CAM 1"*, *"SERVEUR LECTURE 2"*, *"PGM ANTENNE"*) aux émetteurs et récepteurs NMOS sans modifier la configuration interne des équipements.
- **Caractéristiques techniques & opérationnelles** :
  - Persistance double : les étiquettes personnalisées sont enregistrées dans `JSON_senders_labs.json` et `JSON_receivers_labs.json` et conservées même lors des réactualisations de la base réseau.
  - Inspecteur SDP en direct : interroge le manifeste SDP actif de chaque émetteur et décode les paramètres techniques du flux.
- **Fonctionnalités clés** :
  - Décodage temps réel : résolution, fréquence, échantillonnage, colorimétrie, canaux audio (ex: `1080i50 BT.709`, `48000-L24-2CH`).
  - Bouton **« Libérer »** : restaure le nom matériel NMOS d'origine avec fenêtre de confirmation sécurisée.
  - Filtre multicritères par équipement et type de média.

### 5. Configurateur de périphériques virtuels (`virtual.html`)
Création et assemblage des équipements de production multi-flux.
- **Fonctionnement général** : En régie de télévision, une caméra ou un magnétoscope rassemble plusieurs flux élémentaires distincts (1 vidéo, 4 à 16 canaux audio, 1 flux de métadonnées ANC). Ce module permet de les associer sous une source ou destination virtuelle unique.
- **Caractéristiques techniques & opérationnelles** :
  - Éditeur maître-détail pour les Sources Virtuelles et Destinations Virtuelles.
  - Contrôle d'intégrité strict : empêche les doublons de flux ou les incohérences de format.
- **Fonctionnalités clés** :
  - Menus déroulants filtrés par type de média (Vidéo, Audio, Data).
  - Ajout, modification et suppression sécurisés avec modales de confirmation.
  - Permet la commutation globale en 1 clic (*full-take*) dans la matrice et le pupitre tactile.

### 6. Moteur de règles & Workflows (`workflow.html`)
Générateur de macros et d'automatisations pour la régie.
- **Fonctionnement général** : Permet de concevoir des scénarios de bascule automatisés (ex: *"Lorsque le flux PGM bascule vers la Ligne 1, commuter également l'écoute monitoring et l'entrée 4 du multiviewer"*).
- **Caractéristiques techniques & opérationnelles** :
  - Cartes visuelles de règles avec déclencheurs conditionnels et séquences d'actions chaînées.
  - Validateur syntaxique en direct vérifiant la présence et la conformité des émetteurs/récepteurs référencés.
- **Fonctionnalités clés** :
  - Duplication et réordonnancement des workflows.
  - Notifications d'exécution (toasts de succès, rapports d'erreur).
  - Exportation et importation des règles d'automatisation.

### 7. Pupitre tactile de télécommande (`panel.html`)
Émulation de pupitre physique de commande broadcast (*hardware panel*), optimisée pour tablettes tactiles.
- **Fonctionnement général** : Reproduit la logique d'un panneau physique de commutation à touches (type grille 1RU/2RU) pour des opérations rapides et sans risque d'erreur en cours de direct.
- **Caractéristiques techniques & opérationnelles** :
  - Thème sombre à très fort contraste avec larges touches tactiles adaptées à une manipulation sur iPad ou écran tactile de console.
  - Code couleur standard broadcast : Ambre/Rouge pour la destination sélectionnée, Vert pour la source active, Bleu pour la sélection armée.
- **Fonctionnalités clés** :
  - Sélecteur de type d'essence : Vidéo, Audio, Data ou Virtuel.
  - Commutation virtuelle immédiate tous flux confondus.
  - Interface autonome avec sélecteur de langue intégré, prête pour un affichage plein écran en mode borne (*kiosk*).

### 8. Supervision & Enregistrement des nœuds (`nodes.html`)
Centre de gestion et de diagnostic de l'ensemble des équipements NMOS connectés.
- **Fonctionnement général** : Enregistre les URL de base des nœuds NMOS (`config.nodes.json`) et surveille leur joignabilité sur le réseau local.
- **Caractéristiques techniques & opérationnelles** :
  - Pastilles d'état dynamiques vert/rouge avec test de joignabilité en arrière-plan optimisé pour éviter tout verrouillage d'onglet.
  - Modale de découverte automatique : saisissez une adresse IP et un port, cliquez sur **« Détecter »**, et le système interroge `/x-nmos/node/` pour lister les versions IS-04 supportées (`v1.0`, `v1.1`, `v1.2`, `v1.3`).
- **Fonctionnalités clés** :
  - **Mise à jour d'un nœud individuel** : Réactualise les flux d'un équipement sans perturber le reste de la grille.
  - **Mettre à jour la base NMOS** : Scan complet de tous les nœuds actifs : extrait les devices, flows, senders et receivers, met à jour les URL de contrôle IS-05 et purge les matériels supprimés.
  - Suppression sécurisée de nœuds avec fenêtre de confirmation modale.

---

## 🛠️ Architecture du projet

```
nmos-express/
├── images/                  # Logos et icônes de l'application
├── lib/
│   ├── css/                 # Feuilles de style locales (Tailwind, FontAwesome, modal.css, etc.)
│   └── js/                  # Contrôleurs JavaScript, chargeur de menu, gestionnaire modale/toast, i18n
├── config.nodes.json        # Liste des URL d'API des nœuds NMOS déclarés
├── config.profiles.json     # Définition des profils SDP acceptés (SMPTE ST 2110-20/30/40)
├── JSON_*.json              # Fichiers d'état locaux (émetteurs, récepteurs, virtuels, workflows)
├── api_*.php                # Endpoints légers en PHP (communication cURL vers IS-04 et IS-05)
├── nmos-update.php          # Analyseur / crawler de nœuds et synchroniseur de cache
├── sdp-lib.php              # Parseur SDP et moteur de vérification des profils
└── nmos_simulator.py        # Simulateur multi-nœuds autonome en Python
```

---

## 💻 Installation & Démarrage

### Prérequis

- **PHP 7.4+** ou **PHP 8.x** avec les extensions `php-curl` et `php-json` activées.
- Un navigateur web moderne (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
- *(Optionnel)* **Python 3.8+** (bibliothèque standard uniquement) pour exécuter le simulateur local.

### 1. Téléchargement

Clonez ou copiez le dossier du projet dans le répertoire de votre serveur web :

```bash
git clone https://github.com/votre-compte/nmos-express.git
cd nmos-express
```

### 2. Lancement du serveur Web

Vous pouvez utiliser le serveur web intégré de PHP :

```bash
php -S localhost:8000
```

Ouvrez ensuite votre navigateur à l'adresse : `http://localhost:8000/`.

---

## 🧪 Tester avec le Simulateur Virtuel NMOS

Vous n'avez pas de réseau SMPTE ST 2110 sous la main ? NMOS Express inclut un simulateur complet en Python (`nmos_simulator.py`) ne nécessitant **aucune installation externe** (aucun `pip install`).

### 1. Démarrer la simulation

Dans une fenêtre de terminal séparée :

```bash
python nmos_simulator.py
```

Le script effectue automatiquement les opérations suivantes :
- Sauvegarde vos fichiers réels dans `*.real.json`.
- Démarre **5 serveurs HTTP multi-threadés indépendants** sur l'adresse locale :
  - Port `8001` : `SNP-GATEWAY11` (Nœud IS-04, Devices, Flows & Senders)
  - Port `8002` : `SNP-GATEWAY-MONITOR1` (Nœud IS-04, Devices & Receivers)
  - Port `8003` : `RossRx01` (Receivers)
  - Port `8004` : `RossRx02` (Receivers)
  - Port `8005` : `NEURON-COLOR` (Nœud hybride de traitement)
- Génère à la volée des SDP ST 2110 valides (`/sdp/<sender_id>`) avec des adresses multicast stables (`239.100.x.x`).
- Gère les requêtes de commutation **IS-05 (PATCH /staged)** avec prise en compte immédiate.

### 2. Revenir à vos adresses physiques réelles

Lorsque vous retournez sur votre infrastructure physique :

```bash
python nmos_simulator.py --restore
```

Cette commande réapplique vos adresses IP d'origine sans perte de données.

---

## ⚙️ Configuration

### Ajouter un vrai équipement NMOS

1. Rendez-vous sur `http://localhost:8000/nodes.html`.
2. Cliquez sur **« Ajouter un noeud »**.
3. Renseignez l'adresse IP et le port de l'équipement (ex: `192.168.1.50`, port `8080`).
4. Cliquez sur **« Détecter »** pour interroger `/x-nmos/node/` et récupérer automatiquement la version IS-04 disponible.
5. Validez puis cliquez sur **« Mettre à jour la base NMOS »** pour scanner les émetteurs et récepteurs.

---

## 🔒 Sécurité et bonnes pratiques

- NMOS Express dialogue directement avec les cartes de contrôle des équipements en HTTP/HTTPS. Il est recommandé de le déployer sur un VLAN d'administration ou de contrôle broadcast dédié.
- Les fichiers `*.real.json` contiennent les adresses IP et identifiants internes de votre réseau. Ils sont automatiquement ignorés par `.gitignore` pour éviter toute fuite de topologie privée.

---

## 👤 Auteur & Crédits

- **Auteur** : Emanuele Di Mauro
- **Société** : IIFA Media180
- **Projet** : NMOS Express (Version 1.0)
- **Copyright** : &copy; 2026 Emanuele Di Mauro &mdash; IIFA Media180. Tous droits réservés.

---

## 📄 Licence

Ce projet est distribué sous la [Licence MIT](LICENSE).
