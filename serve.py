"""Local server for the project.

Run:  python serve.py          (then open http://localhost:8000/recognition/record.html)
      python serve.py 8080     (to use a different port)

Serves this folder no matter where you run it from, sends the right file types for
MediaPipe's WebAssembly files, and turns off caching so code changes show up on refresh.
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".json": "application/json",
        ".task": "application/octet-stream",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


if __name__ == "__main__":
    server = ThreadingHTTPServer(("", PORT), partial(Handler, directory=ROOT))
    print(f"Serving on http://localhost:{PORT}/")
    print(f"Recorder: http://localhost:{PORT}/recognition/record.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
