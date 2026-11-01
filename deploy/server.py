#!/usr/bin/env python3
"""
server.py — Statik file + API highscore untuk Tilt Plane.

Stdlib saja (tanpa dependensi eksternal). Menyajikan file statik dari --dir:
  GET  /api/scores  → JSON top 10  [{"name","score","level"}, ...]
  POST /api/scores  → simpan skor {"name": str, "score": int, "level": int}
Skor tersimpan di <dir>/scores.json (penulisan atomik, aman antar-thread).
Jalankan bind 127.0.0.1 — publik hanya lewat Cloudflare Tunnel.
"""
import argparse
import json
import os
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

NAME_RE = re.compile(r'^[\w .-]{1,16}$', re.UNICODE)
MAX_BODY = 1024
KEEP_ROWS = 50


def build_handler(root: str, scores_path: str, lock: threading.Lock):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def log_message(self, fmt, *log_args):
            pass  # senyap — jangan banjir jurnal systemd

        @staticmethod
        def _read_scores():
            try:
                with open(scores_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                return []

        @staticmethod
        def _write_scores(rows):
            tmp = scores_path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(rows, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, scores_path)

        def _reply(self, rows, code=200):
            body = json.dumps(rows[:10]).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.split('?')[0] == '/api/scores':
                with lock:
                    rows = self._read_scores()
                rows.sort(key=lambda r: r.get('score', 0), reverse=True)
                self._reply(rows)
            else:
                super().do_GET()

        def do_POST(self):
            if self.path.split('?')[0] != '/api/scores':
                self.send_error(404)
                return
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0 or length > MAX_BODY:
                self.send_error(413)
                return
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw.decode('utf-8'))
                name = str(data.get('name', '')).strip()
                score = int(data.get('score', 0))
                level = int(data.get('level', 0))
            except Exception:
                self.send_error(400)
                return
            if not NAME_RE.match(name) or not (0 <= score <= 9_999_999) or not (0 <= level <= 100):
                self.send_error(400)
                return
            with lock:
                rows = self._read_scores()
                rows.append({'name': name, 'score': score, 'level': level})
                rows.sort(key=lambda r: r.get('score', 0), reverse=True)
                rows = rows[:KEEP_ROWS]
                self._write_scores(rows)
            self._reply(rows)

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8095)
    ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--dir', default=os.path.dirname(os.path.abspath(__file__)))
    args = ap.parse_args()

    root = args.dir
    scores_path = os.path.join(root, 'scores.json')
    lock = threading.Lock()
    handler = build_handler(root, scores_path, lock)

    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f'Tilt Plane server: http://{args.bind}:{args.port} (root: {root})', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
