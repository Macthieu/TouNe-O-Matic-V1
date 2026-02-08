Roadmap et Jalons
=================

M1 - MVP Contrôle Stable
------------------------
Livré:
- Bus de commandes unifié `.state/cmd.txt` avec verrou.
- `pause/resume/next/prev/stop/clear` stabilisés.
- Queue persistée sans copie (JSON + symlinks).

Critères d’acceptation:
- 200 commandes rapides sans perte.
- `cmd.log` sans erreurs récurrentes.
- `queue.json` cohérent avec MPD après sync.

M2 - Bibliothèque Massive
-------------------------
Livré:
- Scan incrémental basé sur mtime.
- SQLite + FTS5.
- Détection/sync des roots montés.

Critères d’acceptation:
- Scan startup sans rescan complet.
- Recherche FTS < 150 ms sur ~60k tracks.
- Ajout/retrait de root USB/NAS détecté.

M3 - Multiroom Snapcast
-----------------------
Livré:
- Endpoints statut/volume/mute/stream/latence.
- Scripts d’activation airplay/bluetooth vers snapcast.

Critères d’acceptation:
- Sélection de stream fonctionnelle.
- Latence configurable côté clients.
- Sync perçue stable multi-pièces.

M4 - Analogique Pur/Cast
------------------------
Livré:
- État serveur analogique persistant (`.state/analog.json`).
- API mode `pure|cast`, routes et presets.
- UI `inputs` reliée backend pour routes + mode.

Critères d’acceptation:
- Le routage survit au redémarrage backend.
- Bascule `pure/cast` visible via API et UI.
- Presets sauvegardés/appliqués/supprimés via API.

Prochaines Priorités
--------------------
1. Brancher la matrice analogique sur GPIO/relais réels.
2. Brancher `cast` sur pipeline ADC réel.
3. Ajouter tests API d’intégration (`pytest`).
