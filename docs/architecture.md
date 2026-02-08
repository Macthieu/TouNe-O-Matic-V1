Architecture Cible
==================

Modules
-------
- API: `backend/app.py`
- Worker commande: `backend/daemon.py`
- UI: `ui/assets/js/*`
- Intégrations système: `scripts/*.sh`, `scripts/*.service`

Flux Audio
----------
1. UI/API écrit les commandes dans `.state/cmd.txt`.
2. `daemon.py` lit/applique vers MPD et publie `.state/state.json`.
3. Queue persistée dans `.state/queue.json` + symlinks `.state/queue/`.
4. Sortie locale:
   - `strict`: ALSA `hw:*` (bit-perfect)
   - `compatible`: `plughw:*` (mix/résampling autorisé)
5. Multiroom: Snapcast (stream MPD + clients sync).
6. Analogique:
   - `pure`: commutation/presets (pas d’ADC)
   - `cast`: ADC USB -> Snapcast

API Clés
--------
- Commandes: `POST /api/cmd`
- État: `GET /api/state`, `GET /api/cmd/status`, `GET /api/cmd/logs`
- Queue: `GET/POST /api/queue`, `POST /api/queue/sync`
- Bibliothèque: `POST /api/library/scan`, `GET /api/library/search`
- Snapcast: `GET /api/snapcast/status`, `POST /api/snapcast/*`
- Analogique:
  - `GET /api/analog/state`
  - `POST /api/analog/mode`
  - `POST /api/analog/cast`
  - `POST /api/analog/route`
  - `POST /api/analog/routes`
  - `POST /api/analog/presets`
  - `POST /api/analog/presets/apply`
  - `POST /api/analog/presets/delete`

Persistance SD
--------------
- Code + DB + cache léger + fichiers runtime.
- Bibliothèque audio lourde hors SD (USB/NAS).
