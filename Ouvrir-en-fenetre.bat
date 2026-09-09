@echo off
:: Ouvre index.html dans une fenetre Chrome independante (sans onglets ni barre
:: d'adresse), sans dependre du menu "Creer un raccourci" de Chrome (masque ou
:: absent selon la version/la politique du poste - voir CLAUDE.md).
::
:: A garder dans le meme dossier que index.html : %~dp0 designe ce dossier,
:: donc ce lanceur fonctionne que le dossier soit sur ce poste ou sur un
:: lecteur reseau (lettre mappee, ex. Z:\...).
setlocal
set "URL=file:///%~dp0index.html"

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)

echo Google Chrome est introuvable sur ce poste.
echo Ouvrez index.html manuellement, directement dans Chrome.
pause

:fin
