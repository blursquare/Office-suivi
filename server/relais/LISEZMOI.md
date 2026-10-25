# Relais CLAIRE des postes — à l'intention de l'administrateur de l'antivirus

`CLAIRE-relais.exe` est un petit programme interne de l'étude (CLAIRE, outil de suivi des dossiers, servi par le serveur du
bureau). Installé une fois par poste et par utilisateur, sans droit d'administrateur, il :

- affiche en bas à droite de l'écran une carte CLAIRE sombre (sur le modèle de Teams) pour chaque nouveauté (message,
  proposition, réaction) où l'on peut répondre, réagir, autoriser ou refuser une proposition, ou ouvrir CLAIRE ; la réponse part
  au serveur CLAIRE du bureau, jamais ailleurs ;
- pose une pastille (rond rouge et nombre) en haut à droite de l'icône de la fenêtre CLAIRE dans la barre des tâches (icône de
  la fenêtre remplacée), sans clignotement ; icône CLAIRE dans la zone de notification ;
- à chaque appel 3CX, met au premier plan la fenêtre CLAIRE (appelant connu) ou la fenêtre utilisée avant la sonnerie ; pour un
  appel d'un client dont la fenêtre CLAIRE est fermée, il lance Chrome ou Edge sur CLAIRE.

**Ce qu'il ne fait pas (version 1.3, 25/10/2026)** — retiré pour qu'il ne ressemble en rien à un logiciel espion, après le
blocage du 12/10 : il ne lit plus Microsoft Word (ni aucun autre programme), ne lit jamais le presse-papiers, n'efface pas la
marque « téléchargé d'Internet » (Zone.Identifier), n'arrête aucun processus de force (un relais déjà lancé reçoit un signal
nommé `Local\CLAIRE-relais-arret` et s'arrête seul), n'efface aucun fichier d'un autre programme. Aucune frappe simulée, aucun
script, aucun accès à Internet.

À l'installation (lancé depuis Téléchargements), il demande le code d'installation que l'utilisateur colle (copié par CLAIRE),
le vérifie auprès du serveur CLAIRE, se copie dans `%LOCALAPPDATA%\Programs\CLAIRE\CLAIRE-relais.exe` (emplacement habituel
des programmes installés pour un seul utilisateur) et garde sa configuration dans `%LOCALAPPDATA%\CLAIRE\relais.json`. Seule
écriture dans le registre : la valeur `CLAIRE-relais` de `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (démarrage avec
la session). Il ne parle qu'au serveur CLAIRE du réseau du bureau (HTTP, une requête par seconde, adresse de la
configuration). Code source : `server/relais/CLAIRE-relais.cs` du dépôt de CLAIRE. Retrait : `CLAIRE-relais.exe --retirer`.

## Exclusion à créer (Panda Endpoint Protection Plus)

Le programme est **le même fichier sur tous les postes** (non signé) :

- **SHA-256 : `0c55287a5bde91370ade375d8ea6059d0f638bce2bdc1078e971f17de914ec4b`**
- MD5 : `2b8321befb25dafa96c68129bc599fe5` (si la console demande cette empreinte)
- Nom : `CLAIRE-relais.exe` (« Relais CLAIRE du poste », produit « CLAIRE », version 1.3.0.0)
- Emplacements : le dossier Téléchargements de l'utilisateur au moment de l'installation, puis
  `%LOCALAPPDATA%\Programs\CLAIRE\CLAIRE-relais.exe`

Demande : autoriser ce fichier (empreinte ci-dessus) sur les postes de l'étude, et le sortir de quarantaine là où il a été
détecté (« Virus détecté — nom inconnu », 12/10/2026). Cette empreinte ne change que si le programme est modifié : la nouvelle
sera alors redonnée. **Nouvelle empreinte le 25/10/2026 (version 1.3)** : les exclusions des anciennes (`77b7bb9a…8b27325`,
`919399b7…edddf4105`) ne valent plus pour ce fichier. Si la console indique la règle qui avait bloqué le relais le 12/10
(programme non classé, indicateur d'attaque, script), merci de nous la communiquer.
