#!/usr/bin/env python3
"""本機 Firebase Realtime Database REST 模擬器；資料只存於記憶體。

Usage: python3 dev/mock-rtdb.py 9000
"""
import copy
import hashlib
import json
import queue
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

LOCK = threading.RLock()
TREE = None
SUBSCRIBERS = []


def compact(value):
    """RTDB 不保留 null、空物件或空陣列。"""
    if isinstance(value, dict):
        value = {k: v for k, raw in value.items() if (v := compact(raw)) is not None}
        return value or None
    if isinstance(value, list):
        value = [compact(v) for v in value]
        while value and value[-1] is None:
            value.pop()
        return value or None
    return value


def read(path):
    node = TREE
    for key in path:
        if isinstance(node, dict):
            node = node.get(key)
        elif isinstance(node, list) and key.isdigit() and int(key) < len(node):
            node = node[int(key)]
        else:
            return None
    return copy.deepcopy(node)


def assign(node, path, value):
    if not path:
        return compact(copy.deepcopy(value))
    key, *rest = path
    if isinstance(node, list) and key.isdigit():
        index = int(key)
        if index > 100000:
            raise ValueError("陣列索引過大")
        while len(node) <= index:
            node.append(None)
        node[index] = assign(node[index], rest, value)
    else:
        if not isinstance(node, dict):
            node = {}
        child = assign(node.get(key), rest, value)
        if child is None:
            node.pop(key, None)
        else:
            node[key] = child
    return compact(node)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def etag(value):
    return '"' + hashlib.sha1(encoded(value)).hexdigest() + '"'


def notify(changed):
    for watched, events in SUBSCRIBERS:
        if changed[:len(watched)] == watched:
            relative = changed[len(watched):]
            events.put({"path": "/" + "/".join(relative), "data": read(changed)})
        elif watched[:len(changed)] == changed:
            events.put({"path": "/", "data": read(watched)})


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, if-match, X-Firebase-ETag")
        self.send_header("Access-Control-Expose-Headers", "ETag")
        self.send_header("Access-Control-Max-Age", "600")

    def path_parts(self):
        path = unquote(urlsplit(self.path).path)
        if not path.endswith(".json"):
            self.reply(404, {"error": "路徑必須以 .json 結尾"})
            return None
        return [p for p in path[:-5].split("/") if p]

    def reply(self, status, value, with_etag=False):
        body = encoded(value)
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if with_etag:
            self.send_header("ETag", etag(value))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path_parts()
        if path is None:
            return
        if "text/event-stream" in self.headers.get("Accept", ""):
            self.stream(path)
        else:
            with LOCK:
                value = read(path)
            query = parse_qs(urlsplit(self.path).query)
            if query.get("orderBy") == ['"$key"'] and isinstance(value, dict):
                ordered = sorted(value)
                try:
                    limit = int(query.get("limitToLast", [str(len(ordered))])[0])
                except ValueError:
                    self.reply(400, {"error": "limitToLast 必須是正整數"})
                    return
                if limit < 1:
                    self.reply(400, {"error": "limitToLast 必須是正整數"})
                    return
                value = {key: value[key] for key in ordered[-limit:]}
            self.reply(200, value, self.headers.get("X-Firebase-ETag", "").lower() == "true")

    def stream(self, path):
        events = queue.Queue()
        subscription = (path, events)
        with LOCK:
            SUBSCRIBERS.append(subscription)
            events.put({"path": "/", "data": read(path)})
        try:
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            while True:
                try:
                    event = events.get(timeout=15)
                    data = b"event: put\ndata: " + encoded(event) + b"\n\n"
                except queue.Empty:
                    data = b": keep-alive\n\n"
                self.wfile.write(data)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with LOCK:
                SUBSCRIBERS.remove(subscription)

    def mutate(self, method):
        global TREE
        path = self.path_parts()
        if path is None:
            return
        try:
            data = None if method == "DELETE" else json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            if method == "PATCH" and data is not None and not isinstance(data, dict):
                raise ValueError("PATCH 必須是 JSON 物件")
            with LOCK:
                current = read(path)
                match = self.headers.get("if-match")
                if match is not None and match != etag(current) and not (match == "*" and current is not None):
                    self.reply(412, current, True)
                    return
                if method == "PATCH" and data is not None:
                    changed = []
                    for key, value in data.items():
                        target = path + [p for p in key.split("/") if p]
                        TREE = assign(TREE, target, value)
                        changed.append(target)
                else:
                    TREE = assign(TREE, path, data)
                    changed = [path]
                for target in changed:
                    notify(target)
                result = read(path)
            self.reply(200, result, True)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.reply(400, {"error": str(exc)})

    def do_PUT(self):
        self.mutate("PUT")

    def do_PATCH(self):
        self.mutate("PATCH")

    def do_DELETE(self):
        self.mutate("DELETE")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    print(f"本機 RTDB：http://127.0.0.1:{port}（停止後資料會消失）", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
