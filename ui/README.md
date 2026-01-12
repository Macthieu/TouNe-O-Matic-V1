# TouNe • Material GUI (UI only)

Base d'interface Web (HTML/CSS/JS) inspirée du style "Material Skin" (Lyrion/LMS), **implémentée from scratch**.

## Démarrer (dev)

```bash
cd toune-material-ui
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Démarrer (nginx)

Déployer le dossier `toune-material-ui` sous ton root nginx, et activer `index.html`.
L'app utilise un routing par hash (`#/home`, `#/music`, `#/now`, etc.) donc aucun rewrite spécial n'est requis.

## Structure

- `index.html` : shell (appbar + drawer + playerbar)
- `assets/css/app.css` : style material-ish (sans framework)
- `assets/js/app.js` : bootstrap + binding UI + transport mock MPD
- `assets/js/pages/*` : pages (accueil, ma musique, artistes, albums, radio, favoris, playlists, apps, now playing, queue, players, settings, about)
- `assets/js/services/mpd.js` : adaptateur MPD (mock) — à remplacer plus tard par REST/WS

## Branchement MPD (plus tard)

Quand tu voudras brancher le vrai MPD, tu remplaceras l'implémentation mock dans `assets/js/services/mpd.js`
par un transport qui fait des appels HTTP (`/api/...`) ou WebSocket.
