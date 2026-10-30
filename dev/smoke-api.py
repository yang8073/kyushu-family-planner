#!/usr/bin/env python3
"""Run a real PHP server plus curl smoke checks; all data lives in a deleted temp dir."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:8899/api.php'


def request(op, body=None, origin=None, method=None):
    cmd = ['curl', '--silent', '--show-error', '--max-time', '4', '-w', '\n%{http_code}', URL + '?op=' + op]
    if origin:
        cmd += ['-H', 'Origin: ' + origin]
    if method:
        cmd += ['-X', method]
    if body is not None:
        cmd += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
    result = subprocess.run(cmd, input=json.dumps(body, ensure_ascii=False) if body is not None else None, text=True, capture_output=True, check=True)
    value, status = result.stdout.rsplit('\n', 1)
    return int(status), json.loads(value) if value else None


def main():
    with tempfile.TemporaryDirectory(prefix='kyushu-api-smoke-') as temp:
        data = Path(temp) / 'data'
        env = dict(os.environ, KYUSHU_DATA_DIR=str(data))
        with open(Path(temp) / 'php.log', 'w+') as log:
            server = subprocess.Popen(['php', '-S', '127.0.0.1:8899', '-t', str(ROOT / 'dev/server')], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(50):
                    if server.poll() is not None:
                        raise RuntimeError('PHP server failed to start; port 8899 may already be in use')
                    try:
                        assert request('state') == (200, None)
                        break
                    except subprocess.CalledProcessError:
                        time.sleep(0.05)
                else:
                    raise RuntimeError('PHP server did not become ready')
                state = {'by': '小明', 'byId': 'device123456', 'summary': '建立共享行程', 'plan': {'days': [{'id': 'day1', 'label': '2/9(二)', 'items': ['dazaifu']}], 'pool': ['tower']}, 'wishes': {'tower': {'device123456': {'pool': 'want', 'nick': '小明', 'at': 1000}}}}
                status, response = request('save', {'baseRev': 0, 'state': state})
                assert status == 200 and response['ok'] and response['state']['rev'] == 1
                first = response['state']
                assert abs(first['at'] - time.time() * 1000) < 5000
                history_file = data / 'history/000001.json'
                original = hashlib.sha256(history_file.read_bytes()).digest()
                assert request('save', {'baseRev': 0, 'state': state}) == (409, {'conflict': True, 'state': first})
                assert request('history&limit=200') == (200, [{k: first[k] for k in ['rev', 'at', 'by', 'byId', 'summary']}])
                assert request('version&rev=1') == (200, first)
                assert request('rev') == (200, {k: first[k] for k in ['rev', 'at', 'by']})
                restored = copy.deepcopy(state)
                restored['summary'] = '還原至第 1 版'
                assert request('save', {'baseRev': 1, 'state': restored})[1]['state']['rev'] == 2
                assert [x['rev'] for x in request('history')[1]] == [2, 1]
                assert hashlib.sha256(history_file.read_bytes()).digest() == original
                assert len(list((data / 'backup').glob('state-*.json'))) == 1
                assert request('version&rev=999')[0] == 404
                for bad in ['pool', 'nick', 'ids', 'days', 'bytes']:
                    value = copy.deepcopy(state)
                    if bad == 'pool':
                        value['wishes']['tower']['device123456']['pool'] = 'invalid'
                    elif bad == 'nick':
                        value['by'] = '名字太長' * 4
                    elif bad == 'ids':
                        value['plan']['pool'] = ['../invalid']
                    elif bad == 'days':
                        value['plan']['days'] *= 31
                    else:
                        value['summary'] = 'x' * (512 * 1024)
                    assert request('save', {'baseRev': 2, 'state': value})[0] == 400, bad

                # Valid custom spot
                valid_custom = copy.deepcopy(restored)
                valid_custom['summary'] = '新增自訂景點：測試景點'
                valid_custom['customs'] = {
                    'u_testspot1': {
                        'zh': '測試自訂景點',
                        'cat': '餐廳',
                        'area': '福岡市區',
                        'addr': '福岡市博多區',
                        'lat': 33.59,
                        'lng': 130.41,
                        'note': '這是一個測試景點',
                        'url': 'https://example.com/spot',
                        'by': '小明',
                        'byId': 'device123456',
                        'at': 1000
                    }
                }
                status, response = request('save', {'baseRev': 2, 'state': valid_custom})
                assert status == 200 and response['ok'] and response['state']['rev'] == 3
                assert response['state']['customs']['u_testspot1']['zh'] == '測試自訂景點'
                assert request('version&rev=3')[1]['customs']['u_testspot1']['lat'] == 33.59

                # Invalid customs validation checks
                for bad_c in ['cat', 'lat', 'url', 'extra_field', 'id', 'zh_len']:
                    bad_state = copy.deepcopy(valid_custom)
                    if bad_c == 'cat':
                        bad_state['customs']['u_testspot1']['cat'] = '無效分類'
                    elif bad_c == 'lat':
                        bad_state['customs']['u_testspot1']['lat'] = 999.0
                    elif bad_c == 'url':
                        bad_state['customs']['u_testspot1']['url'] = 'ftp://evil.com'
                    elif bad_c == 'extra_field':
                        bad_state['customs']['u_testspot1']['forbidden'] = True
                    elif bad_c == 'id':
                        bad_state['customs']['../bad_id'] = bad_state['customs'].pop('u_testspot1')
                    elif bad_c == 'zh_len':
                        bad_state['customs']['u_testspot1']['zh'] = '長' * 61
                    assert request('save', {'baseRev': 3, 'state': bad_state})[0] == 400, bad_c

                assert request('state', origin='https://evil.example')[0] == 403
                assert request('state', origin='https://yang8073.github.io')[0] == 200
                assert request('state', origin='http://localhost:8000')[0] == 200
                assert request('save', origin='http://127.0.0.1:8000', method='OPTIONS')[0] == 204
                # Simulate interruption after the write-ahead journal, before any snapshot rename.
                pending = copy.deepcopy(first)
                pending.update(rev=4, summary='中斷後復原', at=int(time.time()*1000))
                (data / 'transaction.json').write_text(json.dumps(pending), encoding='utf-8')
                assert request('state') == (200, pending)
                assert request('version&rev=4') == (200, pending)
                assert not (data / 'transaction.json').exists()
                assert request('rev')[1]['rev'] == 4
                assert data.stat().st_mode & 0o777 == 0o700
                assert history_file.stat().st_mode & 0o777 == 0o600
                # Use a fresh fixed-window counter to check the exact 60-save limit.
                for file in (data / 'rate').glob('*.json'):
                    file.unlink()
                for _ in range(60):
                    assert request('save', {'baseRev': 0, 'state': state})[0] == 409
                assert request('save', {'baseRev': 0, 'state': state})[0] == 429
                print('PASS PHP/curl: rev1, conflict 409, history/version/rev, restore rev2, immutable files, backup, validation, CORS/OPTIONS, crash recovery, permissions, 60/min rate limit')
            except Exception:
                log.seek(0)
                print(log.read()[-6000:])
                raise
            finally:
                server.terminate()
                server.wait(timeout=5)
    print('Temporary API data deleted; PHP server stopped.')


if __name__ == '__main__':
    main()
