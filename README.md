# Mongolingo

Plateforme pédagogique pour apprendre et expérimenter les requêtes MongoDB.
L’application associe une interface React à une API Express connectée à MongoDB.

## Fonctionnalités

- parcours progressif de questions et exercices MongoDB ;
- exécution contrôlée de requêtes sur des collections de démonstration ;
- suivi local de la progression et des séries quotidiennes ;
- exploration des collections et de leurs schémas JSON ;
- import et export de données JSON ou BSON ;
- création de sauvegardes locales ;
- réinitialisation des données fictives.

## Architecture

    frontend/    Interface React et Vite
    server/      API Express et accès MongoDB
    schemas/     Schémas JSON des collections
    data/demo/   Jeu de données fictif
    backups/     Sauvegardes locales ignorées par Git

## Démarrage

Prérequis : Node.js 20 ou version ultérieure, npm et une instance MongoDB.

Une instance MongoDB locale peut être lancée avec Docker :

    docker compose up -d

Installer ensuite les dépendances et démarrer l’API avec le frontend :

    npm install
    npm --prefix frontend install
    npm run dev

- interface : <http://localhost:5173>
- API : <http://localhost:4000>
- MongoDB : mongodb://127.0.0.1:27017

Les variables MONGO_URI, MONGO_DB_NAME et PORT permettent d’adapter la connexion
et le port de l’API.

## Vérifications

    npm run lint
    npm run build

## Sécurité

Mongolingo est conçu pour un environnement local d’apprentissage. L’API ne doit
pas être exposée directement sur Internet sans authentification, limitation des
opérations, contrôle réseau et durcissement de la configuration CORS.

