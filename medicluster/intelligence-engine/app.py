"""Loopback-only model worker; gateway authenticates clinician identity."""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).with_name('.env'))
import hmac
import re
from flask import Flask, g, request, jsonify
from werkzeug.exceptions import HTTPException
from runtime import ApiError
import brain
import radar

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 128 * 1024 * 1024

@app.before_request
def authenticate():
    if request.path == '/health': return
    expected = os.environ.get('INTELLIGENCE_TOKEN', '')
    if not expected: raise ApiError(503, 'Worker authentication is not configured')
    supplied = request.headers.get('X-Intelligence-Key', '')
    if not hmac.compare_digest(expected.encode(), supplied.encode()): raise ApiError(401, 'Worker authentication required')
    identity = request.headers.get('X-Actor-Id', '')
    if not re.fullmatch(r'[A-Za-z0-9_:@.\-]{1,160}', identity): raise ApiError(400, 'Valid actor required')
    g.actor = identity

@app.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.errorhandler(ApiError)
def api_error(error): return jsonify(error=error.message), error.status

@app.errorhandler(HTTPException)
def http_error(error): return jsonify(error=error.description), error.code

@app.errorhandler(Exception)
def unexpected(error):
    app.logger.exception('Worker request failed')
    return jsonify(error='Intelligence worker could not complete this request'), 500

@app.get('/health')
def health(): return jsonify(service='medicluster-intelligence', brain=brain.status(), radar=radar.status())

app.register_blueprint(brain.bp)
app.register_blueprint(radar.bp)

if __name__ == '__main__': app.run(host='127.0.0.1', port=8090, threaded=True, debug=False)
