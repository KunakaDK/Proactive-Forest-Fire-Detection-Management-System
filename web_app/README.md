# Application Web de Surveillance de Feux de Forêt (Tâche 3)

Ce projet est une application web de type **Backend-for-Frontend (BFF)** développée en Python/Flask et JavaScript/HTML/CSS pur. Son objectif est de fournir une interface utilisateur pour visualiser et gérer les données d'un système IoT de détection de feux de forêt, en agissant comme un proxy pour une API REST distante.

## Architecture

L'application fonctionne comme un intermédiaire léger :
1.  **Client (Navigateur)** : Le Frontend (HTML/JS/CSS) envoie des requêtes au serveur Flask.
2.  **Serveur Flask (BFF)** : Reçoit les requêtes, gère l'authentification (JWT), et les transmet à l'API distante en ajoutant le token d'autorisation.
3.  **API Distante (VM)** : Traite la requête et renvoie les données.

**URL de l'API Distante :** `http://192.168.1.100:5000/api`

## Stack Technologique

*   **Backend :** Python 3.11+, Flask, `requests`
*   **Frontend :** HTML5, JavaScript (Vanilla), CSS Pur (Flexbox/Grid)
*   **Librairies :** LeafletJS (Cartographie), Chart.js (Graphiques)

## Structure du Projet

```
fire_monitor_app/
├── app.py                  # Serveur Flask (Proxy API, Authentification, Routes)
├── requirements.txt        # Dépendances Python (Flask, requests)
├── README.md               # Ce fichier
├── templates/
│   ├── base.html           # Layout principal (Sidebar, Header, Footer)
│   ├── login.html          # Page de connexion
│   ├── index.html          # Tableau de bord (Carte, Liste des nœuds, Détails)
│   └── admin.html          # Page d'administration (Gestion Utilisateurs/Nœuds)
└── static/
    ├── css/
    │   └── style.css       # Styles CSS (Thème sombre/moderne)
    └── js/
        └── main.js         # Logique Frontend (Fetch API, Leaflet, Chart.js)
```

## Installation et Lancement

### Prérequis

*   Python 3.11+
*   `pip`

### Étapes

1.  **Cloner le dépôt (ou créer les fichiers) et naviguer dans le dossier :**
    ```bash
    cd fire_monitor_app
    ```

2.  **Installer les dépendances Python :**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Lancer le serveur Flask :**
    ```bash
    python app.py
    ```
    Le serveur démarrera sur `http://127.0.0.1:5001` (port 5001 pour éviter un conflit avec l'API distante sur 5000).

## Fonctionnalités Implémentées

### 1. Authentification

*   **Page de Login (`/login`)** : Envoie les identifiants à `/api/auth/login` de l'API distante.
*   **Gestion du JWT** : Le token JWT est stocké dans la session Flask (`session['jwt_token']`).
*   **Proxy Sécurisé** : Toutes les requêtes proxy (via `/api/proxy/<path>`) ajoutent automatiquement le header `Authorization: Bearer <token>`.
*   **Gestion 401** : Si l'API distante renvoie un statut `401 Unauthorized`, l'utilisateur est automatiquement déconnecté et redirigé vers la page de login.

### 2. Tableau de Bord (`/`)

*   **Carte Leaflet** : Affiche les nœuds avec des marqueurs colorés selon leur statut (OK/Alerte).
*   **Liste des Nœuds** : Sidebar affichant la liste des nœuds avec un indicateur de statut.
*   **Panneau de Détails** :
    *   Affiche les **métadonnées techniques** (IP, MAC, Firmware, etc.).
    *   Affiche les **statistiques avancées** (Min/Max/Moyenne) pour les capteurs du nœud.
    *   Affiche les **graphiques d'historique** (Température, Humidité, Fumée) via Chart.js.

### 3. Administration (`/admin`)

*   **Accès Restreint** : Protégé par le décorateur `@role_required('admin')`.
*   **Gestion des Utilisateurs** :
    *   Liste des utilisateurs (GET `/api/utilisateurs`).
    *   Création d'utilisateur (POST `/api/auth/register`).
    *   Activation/Désactivation (PUT `/api/utilisateurs/<id>`).
    *   Suppression (DELETE `/api/utilisateurs/<id>`).
*   **Gestion des Nœuds** :
    *   Liste des nœuds (GET `/api/noeuds`).
    *   Fonctionnalités de modification/suppression (placeholders pour les appels PUT/DELETE).

## Compte de Test

Pour tester l'application, vous pouvez utiliser le compte fourni dans la documentation :

| Champ | Valeur |
| :--- | :--- |
| **Username** | `admin` |
| **Password** | `admin` |
| **Rôle** | `admin` |

**Note :** Ce compte ne fonctionnera que si l'API distante est accessible à l'adresse `http://192.168.1.100:5000`.
