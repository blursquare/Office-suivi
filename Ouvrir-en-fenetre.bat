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

rem NB : aucune parenthese dans les lignes echo ci-dessous - une parenthese
rem non echappee a l'interieur d'un bloc if (...) casse l'analyse du script
rem par cmd.exe (erreur "... etait inattendu a ce point"), meme dans du
rem texte affiche. Ne pas en reintroduire ici sans les echapper (^() ^)).
if not exist "%LocalAppData%\Google\Chrome\User Data\RegistreEcheances" (
  echo Premiere utilisation de ce lanceur.
  echo.
  echo Cette fenetre utilise un profil Chrome dedie, separe de votre navigation
  echo habituelle, pour pouvoir s'ouvrir meme si Chrome est deja ouvert.
  echo.
  echo Si vous avez DEJA des dossiers enregistres via un onglet Chrome classique :
  echo   1. Fermez cette fenetre.
  echo   2. Ouvrez l'app normalement dans Chrome, cliquez sur le bouton d'export JSON.
  echo   3. Relancez ce fichier, puis cliquez sur le bouton d'import JSON pour les retrouver ici.
  echo.
  echo Sinon - premiere utilisation de l'app, ou rien a recuperer - appuyez sur une
  echo touche pour continuer normalement.
  pause
)

rem "start" detache le lancement de Chrome de cette fenetre de commande, pour
rem qu'elle se referme aussitot au lieu de rester ouverte en arriere-plan
rem pendant tout l'usage de l'app. (Une version precedente avait retire
rem "start" en le soupconnant de casser --profile-directory - a tort : le
rem vrai bug etait la parenthese dans le message ci-dessus, voir CLAUDE.md.)
where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --profile-directory="RegistreEcheances" --start-maximized --window-position=0,0 --window-size=10000,10000 --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --start-maximized --window-position=0,0 --window-size=10000,10000 --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --start-maximized --window-position=0,0 --window-size=10000,10000 --app="%URL%"
  goto :fin
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --profile-directory="RegistreEcheances" --start-maximized --window-position=0,0 --window-size=10000,10000 --app="%URL%"
  goto :fin
)

echo Google Chrome est introuvable sur ce poste.
echo Ouvrez index.html manuellement, directement dans Chrome.
pause

:fin
