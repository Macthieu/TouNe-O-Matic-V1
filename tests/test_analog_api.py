import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
APP_PATH = REPO_ROOT / "backend" / "app.py"


def _load_backend_module():
    spec = importlib.util.spec_from_file_location("toune_backend_app_test", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class AnalogApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="toune-tests-")
        base = Path(cls.tmp.name)
        os.environ["TOUNE_STATE_DIR"] = str(base / ".state")
        os.environ["TOUNE_DB_PATH"] = str(base / ".data" / "toune.db")
        os.environ["TOUNE_CACHE_DIR"] = str(base / ".data" / "cache")
        os.environ["TOUNE_MEDIA_ROOT"] = str(base / "media")
        os.environ["TOUNE_MUSIC_ROOT"] = str(base / "music")
        os.environ["TOUNE_LIBRARY_LINK_ROOT"] = str(base / "lib-links")
        os.environ["TOUNE_PLAYLISTS_DIR"] = str(base / "playlists")
        os.environ["TOUNE_DOCS_ROOT"] = str(base / "docs")

        cls.module = _load_backend_module()
        cls.client = cls.module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        analog_file = Path(os.environ["TOUNE_STATE_DIR"]) / "analog.json"
        if analog_file.exists():
            analog_file.unlink()

    def _post_json(self, path, payload):
        res = self.client.post(path, json=payload)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        body = res.get_json()
        self.assertTrue(body.get("ok"), body)
        return body.get("data")

    def test_analog_state_default(self):
        res = self.client.get("/api/analog/state")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body.get("ok"), body)
        data = body.get("data") or {}
        self.assertEqual(data.get("mode"), "pure")
        self.assertEqual(data.get("cast", {}).get("enabled"), False)
        self.assertEqual(data.get("routes"), {})

    def test_analog_mode_switch(self):
        data = self._post_json("/api/analog/mode", {"mode": "cast"})
        self.assertEqual(data.get("mode"), "cast")
        self.assertEqual(data.get("cast", {}).get("enabled"), True)

        data = self._post_json("/api/analog/mode", {"mode": "pure"})
        self.assertEqual(data.get("mode"), "pure")
        self.assertEqual(data.get("cast", {}).get("enabled"), False)

    def test_analog_route_enable_disable(self):
        data = self._post_json(
            "/api/analog/route",
            {"input_id": "line-in", "output_id": "dac", "enabled": True},
        )
        self.assertTrue(data.get("routes", {}).get("line-in:dac"))

        data = self._post_json(
            "/api/analog/route",
            {"input_id": "line-in", "output_id": "dac", "enabled": False},
        )
        self.assertNotIn("line-in:dac", data.get("routes", {}))

    def test_analog_presets_lifecycle(self):
        self._post_json(
            "/api/analog/route",
            {"input_id": "line-in", "output_id": "dac", "enabled": True},
        )
        saved = self._post_json("/api/analog/presets", {"name": "Salon"})
        preset = saved.get("preset") or {}
        preset_id = preset.get("id")
        self.assertTrue(preset_id)

        self._post_json(
            "/api/analog/route",
            {"input_id": "line-in", "output_id": "snapcast", "enabled": True},
        )

        applied = self._post_json("/api/analog/presets/apply", {"id": preset_id})
        routes = (applied.get("state") or {}).get("routes") or {}
        self.assertTrue(routes.get("line-in:dac"))
        self.assertNotIn("line-in:snapcast", routes)

        deleted = self._post_json("/api/analog/presets/delete", {"id": preset_id})
        presets = deleted.get("presets") or []
        self.assertFalse(any(p.get("id") == preset_id for p in presets))


if __name__ == "__main__":
    unittest.main(verbosity=2)
