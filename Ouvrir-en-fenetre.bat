@echo off
:: Ouvre index.html dans une fenetre Chrome independante (sans onglets ni barre
:: d'adresse) - meme si Chrome est deja ouvert par ailleurs, grace a un profil
:: Chrome dedie a cette application (voir IMPORTANT ci-dessous).
::
:: A garder dans le meme dossier que index.html : %~dp0 designe ce dossier,
:: donc ce lanceur fonctionne que le dossier soit sur ce poste ou sur un
:: lecteur reseau (lettre mappee, ex. Z:\...).
::
:: IMPORTANT : ce profil Chrome dedie a SA PROPRE sauvegarde (localStorage),
:: separee de celle d'un Chrome "normal" - c'est ce qui lui permet de s'ouvrir
:: sans conflit meme si Chrome tourne deja. Si des dossiers ont deja ete
:: enregistres via un onglet Chrome classique, ce message ne s'affichera
:: qu'une seule fois (a la creation du profil) pour rappeler de les exporter
:: puis de les reimporter ici.
setlocal
set "URL=file:///%~dp0index.html"
set "PROFIL=%LocalAppData%\RegistreEcheances\ProfilChrome"

if not exist "%PROFIL%" (
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

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --user-data-dir="%PROFIL%" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFIL%" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFIL%" --app="%URL%"
  goto :fin
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFIL%" --app="%URL%"
  goto :fin
)

echo Google Chrome est introuvable sur ce poste.
echo Ouvrez index.html manuellement, directement dans Chrome.
pause

:fin
