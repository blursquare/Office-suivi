@echo off
:: Ouvre index.html dans une fenetre Chrome independante (sans onglets ni
:: barre d'adresse) - fonctionne meme si Chrome est deja ouvert par ailleurs.
::
:: A garder dans le meme dossier que index.html : %~dp0 designe ce dossier,
:: donc ce lanceur fonctionne que le dossier soit sur ce poste, sur un
:: lecteur reseau mappe (lettre, ex. Z:\...), ou un chemin reseau direct
:: (\\serveur\partage\...).
::
:: IMPORTANT : --profile-directory cree un profil Chrome nomme, dedie a
:: cette application, DANS le dossier Chrome existant (contrairement a
:: --user-data-dir, qui pointe vers un dossier totalement separe et qui a
:: echoue silencieusement sur un poste teste - probablement une politique
:: de poste qui restreint ce parametre precis, voir CLAUDE.md).
:: Consequence : ce profil dedie a SA PROPRE sauvegarde (localStorage),
:: separee de celle d'un Chrome classique - les dossiers deja enregistres
:: via un onglet Chrome normal n'apparaissent pas automatiquement ici. Le
:: message ci-dessous ne s'affiche qu'une seule fois (tant que ce profil
:: n'a pas encore ete cree) pour le rappeler.
setlocal
set "DOSSIER=%~dp0"
if "%DOSSIER:~-1%"=="\" set "DOSSIER=%DOSSIER:~0,-1%"
set "DOSSIER_URL=%DOSSIER:\=/%"

if "%DOSSIER:~0,2%"=="\\" (
  rem Chemin reseau UNC (\\serveur\partage\...) : file://serveur/partage/...
  set "URL=file:%DOSSIER_URL%/index.html"
) else (
  rem Chemin local ou lecteur mappe (C:\...) : file:///C:/...
  set "URL=file:///%DOSSIER_URL%/index.html"
)

if not exist "%LocalAppData%\Google\Chrome\User Data\RegistreEcheances" (
  echo Premiere utilisation de ce lanceur.
  echo.
  echo Cette fenetre utilise un profil Chrome dedie, separe de votre navigation
  echo habituelle, pour pouvoir s'ouvrir meme si Chrome est deja ouvert.
  echo.
  echo Si vous avez DEJA des dossiers enregistres via un onglet Chrome classique :
  echo   1. Fermez cette fenetre.
  echo   2. Ouvrez l'app normalement dans Chrome, cliquez sur "Exporter (JSON)".
  echo   3. Relancez ce fichier, puis cliquez sur "Importer (JSON)" pour les retrouver ici.
  echo.
  echo Sinon (premiere utilisation de l'app, ou rien a recuperer), appuyez sur une
  echo touche pour continuer normalement.
  pause
)

rem Pas de "start" : appel direct de chrome.exe, seule methode confirmee
rem fonctionner (voir CLAUDE.md - "start" combine a --profile-directory a
rem echoue sur un poste teste, sans qu'on sache pourquoi). chrome.exe rend
rem la main rapidement de lui-meme, cette fenetre ne reste donc pas bloquee.
where chrome >nul 2>nul
if %errorlevel%==0 (
  chrome --profile-directory="RegistreEcheances" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --app="%URL%"
  goto :fin
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  "%LocalAppData%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --app="%URL%"
  goto :fin
)

echo Google Chrome est introuvable sur ce poste.
echo Ouvrez index.html manuellement, directement dans Chrome.
pause

:fin
