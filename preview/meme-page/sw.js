// Service worker minimal pour le Registre des échéances.
//
// Son unique rôle est de satisfaire les critères d'installation d'une application (Chrome exige
// un service worker actif pour proposer "Installer"). Il ne met rien en cache et ne modifie
// aucune requête : l'outil continue de fonctionner exactement comme avant, en ligne comme hors
// ligne, sans dépendre de ce fichier pour son fonctionnement normal.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Un gestionnaire "fetch" vide est nécessaire pour que Chrome considère l'application comme
// installable — sans lui, toutes les requêtes passent simplement par le réseau comme d'habitude.
self.addEventListener('fetch', (event) => {});
