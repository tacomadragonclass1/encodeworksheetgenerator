#!/usr/bin/env python3
"""
Development server for Phonics Worksheet Generator.

Serves all static files exactly like `python3 -m http.server`, but also
handles POST /api/save-image so the Developer tab can write clipart to disk.

Usage:
    python3 scripts/dev_server.py
    open http://localhost:8000
"""
import base64
import json
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent.parent   # …/worksheetgenerator/

OVERRIDES_FILE = ROOT / 'src' / 'data' / 'clipartOverrides.json'
IMAGES_DIR     = ROOT / 'public' / 'images'


class DevHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ── POST endpoints ─────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/save-image':
            self._save_image()
        else:
            self.send_error(404, 'Not found')

    def _save_image(self):
        length = int(self.headers.get('Content-Length', 0))
        try:
            payload = json.loads(self.rfile.read(length))

            word = payload['word'].strip().lower()
            if not re.fullmatch(r'[a-z]+', word):
                raise ValueError(f'Invalid word: {word!r}')

            # imageData is a data URL: "data:image/png;base64,<b64>"
            raw = payload['imageData']
            if ',' in raw:
                raw = raw.split(',', 1)[1]
            img_bytes = base64.b64decode(raw)

            filename = f'word_{word}.png'
            (IMAGES_DIR / filename).write_bytes(img_bytes)

            # Update overrides JSON (create if missing)
            overrides = {}
            if OVERRIDES_FILE.exists():
                overrides = json.loads(OVERRIDES_FILE.read_text('utf-8'))
            overrides[word] = filename
            OVERRIDES_FILE.write_text(
                json.dumps(overrides, indent=2, ensure_ascii=False) + '\n',
                encoding='utf-8',
            )

            self._send_json(200, {'ok': True, 'filename': filename})

        except Exception as exc:
            self._send_json(400, {'ok': False, 'error': str(exc)})

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    # Silence static-file log noise; keep API calls visible
    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    print(f'Dev server → http://localhost:{PORT}')
    print(f'Serving:    {ROOT}')
    HTTPServer(('', PORT), DevHandler).serve_forever()
