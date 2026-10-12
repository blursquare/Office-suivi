# Relais CLAIRE des postes — à l'intention de l'administrateur de l'antivirus

`CLAIRE-relais.exe` est un petit programme interne de l'étude (CLAIRE, outil de suivi des dossiers, servi par le serveur du
bureau). Installé une fois par poste et par utilisateur, sans droit d'administrateur, il :

- lit, par COM, le paragraphe de Microsoft Word où se trouve le curseur, et remplace sur demande un « --- » de ce paragraphe par
  une valeur choisie dans CLAIRE (aide à la rédaction des actes) ;
- à chaque appel 3CX, met au premier plan la fenêtre CLAIRE (appelant connu) ou la fenêtre utilisée avant la sonnerie.

À l'installation (lancé depuis Téléchargements), il lit dans le presse-papiers le code d'installation que CLAIRE vient d'y
copier (puis le vide), arrête un relais déjà lancé (processus « CLAIRE-relais ») et efface les fichiers d'un ancien relais
(`%APPDATA%\CLAIRE\word-claire.*`). Pour un appel d'un client dont la fenêtre CLAIRE est fermée, il lance Chrome ou Edge sur
CLAIRE. Il ne parle qu'au serveur CLAIRE du réseau du bureau (HTTP, adresse de la configuration), n'écrit que dans
`%LOCALAPPDATA%\CLAIRE\` (le programme et `relais.json`) et la valeur `CLAIRE-relais` de
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (démarrage avec la session). Aucune frappe simulée, aucun accès à
Internet. Code source : `server/relais/CLAIRE-relais.cs` du dépôt de CLAIRE. Retrait : `CLAIRE-relais.exe --retirer`.

## Exclusion à créer (Panda Endpoint Protection Plus)

Le programme est **le même fichier sur tous les postes** (non signé) :

- **SHA-256 : `77b7bb9a1f73ab534da99b225300dfa7cb0d9c7510034212f156936aa8b27325`**
- MD5 : `61202703ba3d6c0e56e00b723231a5b5` (si la console demande cette empreinte)
- Nom : `CLAIRE-relais.exe` (« Relais CLAIRE du poste », produit « CLAIRE », version 1.0.0.0)
- Emplacements : le dossier Téléchargements de l'utilisateur au moment de l'installation, puis
  `%LOCALAPPDATA%\CLAIRE\CLAIRE-relais.exe`

Demande : autoriser ce fichier (empreinte ci-dessus) sur les postes de l'étude, et le sortir de quarantaine là où il a été
détecté (« Virus détecté — nom inconnu », 12/10/2026). Cette empreinte ne change que si le programme est modifié : la nouvelle
sera alors redonnée.
