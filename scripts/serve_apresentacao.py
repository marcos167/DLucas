#!/usr/bin/env python3
"""
Servidor do deck de apresentação da DLucas Express.

Por que não `python3 -m http.server`: aquele servidor, ao abrir a raiz,
devolve a LISTAGEM de diretório — e a preview do ambiente carrega a raiz,
então o cliente veria uma lista de arquivos em vez da apresentação.
Aqui a raiz serve o deck.

Uso:  python3 scripts/serve_apresentacao.py [porta]
Padrão: 8899
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
DECK = "/apresentacao.html"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        # raiz → deck (sem listagem de diretório)
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", DECK)
            self.end_headers()
            return
        return super().do_GET()

    def list_directory(self, path):
        # nunca expõe listagem de arquivos
        self.send_error(404, "Not found")
        return None

    def end_headers(self):
        # permite embutir em iframe na preview do ambiente
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), Handler) as httpd:
        print(f"DLucas Express · apresentação em http://0.0.0.0:{port}{DECK}", flush=True)
        print(f"Raiz (/) redireciona para {DECK}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
