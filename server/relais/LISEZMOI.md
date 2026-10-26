# Relais CLAIRE des postes (version 2.0, 26/10/2026)

**Ce n'est plus un programme à part.** `CLAIRE-relais.exe` est **le même fichier que `CLAIRE-serveur.exe`** (Node.js, construit
par l'outil officiel de Node, celui que l'antivirus de l'étude laisse déjà passer sur le serveur), téléchargé depuis CLAIRE
(Réglages › Notifications) sous un autre nom. Sous ce nom, il ne démarre pas le serveur mais le relais (`server/src/entree.js`,
`server/src/relaisPoste.js`). L'ancien relais en C# (versions 1.x), bloqué par Panda Endpoint Protection, est retiré du dépôt.

Installé une fois par poste et par utilisateur, sans droit d'administrateur, il :

- montre chaque nouveauté de CLAIRE (message, réaction, proposition) en **notification de Windows** (centre de notifications),
  au nom de « CLAIRE », avec la photo de l'auteur ; boutons : « Répondre » (CLAIRE ouverte sur le canal), 👍 ❤️ (réaction
  envoyée au serveur), « Autoriser » / « Refuser » d'une proposition ; un clic sur la notification ouvre CLAIRE ;
- met au premier plan la fenêtre CLAIRE (ou l'ouvre) quand on clique « Répondre », « Autoriser » ou la notification.

**Ce qu'il ne fait plus** (pas de code natif) : la pastille rouge chiffrée sur l'icône de la barre des tâches, et la fenêtre CLAIRE
au premier plan à la sonnerie 3CX — celle-ci reste assurée par le fichier `.reg` de Réglages › Téléphonie 3CX, comme avant le relais.

Tout ce que Node ne sait pas faire seul passe par **PowerShell de Windows**, en commandes courtes passées en clair (jamais une
commande encodée, jamais un script écrit sur le disque) : notifications (API des notifications de Windows), fenêtre CLAIRE devant
(UI Automation), boîtes de dialogue de l'installation. Il ne lit jamais le presse-papiers (le code d'installation est collé par
l'utilisateur), n'observe aucune frappe, n'arrête aucun processus de force (un relais déjà lancé est prié de s'arrêter : tuyau
nommé `\\.\pipe\CLAIRE-relais-<utilisateur>` pour la version 2, signal `Local\CLAIRE-relais-arret` pour l'ancienne), n'efface pas
la marque « téléchargé d'Internet ». Il ne parle qu'au serveur CLAIRE du réseau du bureau (HTTP, une requête par seconde).

## Installation

Lancé depuis Téléchargements, il demande le code d'installation (copié par CLAIRE), le vérifie auprès du serveur, se copie dans
`%LOCALAPPDATA%\Programs\CLAIRE\CLAIRE-relais.exe`, garde sa configuration dans `%LOCALAPPDATA%\CLAIRE\relais.json` et écrit,
dans le registre de l'utilisateur (HKCU) seulement :

- `Software\Microsoft\Windows\CurrentVersion\Run`, valeur `CLAIRE-relais` : `conhost.exe --headless "…\CLAIRE-relais.exe" --fond`
  (démarrage avec la session, sans fenêtre) ;
- `Software\Classes\claire-relais` : le lien des boutons des notifications (même programme, `--action "%1"`) ;
- `Software\Classes\AppUserModelId\CLAIRE.Relais` : nom (« CLAIRE ») et icône des notifications.

Retrait : `CLAIRE-relais.exe --retirer`. Contrôle : `CLAIRE-relais.exe --verifier` (configuration lue, jeton vérifié).

## Antivirus

Aucune exclusion propre au relais n'est en principe nécessaire : le fichier est CLAIRE-serveur.exe. Si Panda le bloque quand même
sous ce nom, l'exclusion est celle du programme de CLAIRE (même empreinte que `CLAIRE-serveur.exe` de la version installée).
**Non vérifié sur un poste de l'étude** (notifications, conhost --headless, lien `claire-relais:`) : points `relais-node-*` des
vérifications sur le terrain.
