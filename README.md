Toune-o-matic (Raspberry Pi Audio Hub)
======================================

Base actuelle: `TouNe-O-Matic-V1`.

Objectif: hub audio maison orienté Raspberry Pi, grosse bibliothèque, multiroom Snapcast, sorties bit-perfect quand possible, et gestion analogique (pur/cast).

Architecture Résumée
--------------------
- `backend/app.py`: API Flask (bibliothèque, MPD, queue, Snapcast, AirPlay, Bluetooth, analog).
- `backend/daemon.py`: daemon commande/état (`.state/cmd.txt` -> MPD, `state.json`, `cmd.log`).
- `ui/`: interface web responsive.
- `scripts/`: services systemd + scripts d’intégration.
- `.state/` (runtime): `cmd.txt`, `state.json`, `queue.json`, `queue/`, `analog.json`.

Décisions Techniques
--------------------
- Moteur audio: MPD (recommandé), piloté par un bus de commandes fichier atomique.
- Queue sans copie: persistance JSON + symlinks ordonnés.
- Recherche: SQLite + FTS5.
- Multiroom: Snapcast (RPC + gestion clients/latence).
- Analogique:
  - mode `pure`: commutation/routage analogique
  - mode `cast`: ADC -> Snapcast

Lancement Rapide (dev)
----------------------
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Daemon commandes:
```bash
cd backend
python3 daemon.py
```

Installer les services systemd:
```bash
sudo ./scripts/install-services.sh
```

Smoke test API:
```bash
./scripts/smoke-api.sh
```

Tests analog API:
```bash
./.venv/bin/python -m unittest -v tests/test_analog_api.py
```

Jalons
------
- Voir `docs/roadmap.md`.
- Voir `docs/architecture.md`.
