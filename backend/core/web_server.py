import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from core import rpc


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
}


class RpcRequestHandler(BaseHTTPRequestHandler):
    server_version = "PianoWeb/0.1"

    def log_message(self, format: str, *args: object) -> None:
        print(f"[piano-web] {self.address_string()} - {format % args}")

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/health", "/api/health"):
            self._send_json({"ok": True, "service": "piano-backend"})
            return
        self._send_json({"ok": False, "error": "not found"}, status=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/rpc":
            self._send_json({"ok": False, "error": "not found"}, status=404)
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0:
                raise ValueError("request body is empty")
            raw_body = self.rfile.read(content_length)
            request = json.loads(raw_body.decode("utf-8"))
            line = json.dumps(
                {
                    "id": request.get("id"),
                    "method": request.get("method"),
                    "params": request.get("params") or {},
                },
                ensure_ascii=False,
            )
            response = rpc.handle_line(line)
            self._send_json(response)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            self._send_json({"ok": False, "error": f"invalid request: {error}"}, status=400)
        except Exception as error:
            self._send_json({"ok": False, "error": str(error)}, status=500)


def main() -> None:
    port = int(os.environ.get("PIANO_WEB_PORT", "8000"))
    host = os.environ.get("PIANO_WEB_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), RpcRequestHandler)
    print(f"Piano backend listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
