'use strict';
/**
 * @fileoverview Node-only OAuth2 auth provider for KLB Frontend Framework
 *
 * This module is intentionally NOT re-exported from index.js. It pulls in
 * Node built-ins (`fs`, `os`, `path`) which would break browser bundlers if
 * they followed the main entry. Node applications opt in explicitly:
 *
 *     const klbfw = require('@karpeleslab/klbfw');
 *     const { AuthInfo, bearerAuth } = require('@karpeleslab/klbfw/auth-node');
 *
 *     const info = new AuthInfo();
 *     await info.init();
 *     try { await info.load(); } catch (_) { await info.login(); await info.save(); }
 *     klbfw.setAuth(bearerAuth(info));
 *
 *     // Subsequent rest()/uploadFile() calls now use the Bearer token,
 *     // refresh the token automatically when the API reports it expired,
 *     // and persist the refreshed token to disk.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const DEFAULT_CLIENT_ID = 'oaap-p6rktp-uzaf-adle-djqw-g27ghobe';
const DEFAULT_API_HOST = 'hub.atonline.com';
const DEFAULT_API_BASE_PATH = '/_special/rest/';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Holds an OAuth2 access/refresh token pair, persists it to
 * ~/.config/atonline/auth-<profile>.json, and knows how to re-acquire one
 * via the polltoken login flow.
 */
class AuthInfo {
    constructor(options) {
        options = options || {};
        this.token = null;
        this.name = options.profile || process.env.SHELLS_PROFILE || 'default';
        this.clientId = options.clientId || DEFAULT_CLIENT_ID;
        this.apiHost = options.apiHost || DEFAULT_API_HOST;
        this.apiBasePath = options.apiBasePath || DEFAULT_API_BASE_PATH;
        this.filepath = null;
    }

    async init() {
        const configDir = path.join(os.homedir(), '.config', 'atonline');
        await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
        this.filepath = path.join(configDir, `auth-${this.name}.json`);
    }

    async load() {
        if (!this.filepath) {
            throw new Error('AuthInfo.init() must be called before load()');
        }
        try {
            const data = await fs.readFile(this.filepath, 'utf8');
            this.token = JSON.parse(data);
            this.token.ClientID = this.clientId;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('No login information found');
            }
            throw error;
        }
    }

    async save() {
        if (!this.filepath) {
            throw new Error('AuthInfo.init() must be called before save()');
        }
        if (!this.token) {
            throw new Error('No token to save');
        }
        await fs.writeFile(this.filepath, JSON.stringify(this.token, null, 2), { mode: 0o600 });
    }

    /**
     * Run the OAuth2 polltoken login flow. Prints an authorization URL the
     * user has to open, then polls until the user completes the flow.
     */
    async login() {
        const tokenCreate = await this._unauthRequest('POST', `OAuth2/App/${this.clientId}:token_create`, {});
        const polltoken = tokenCreate.polltoken;
        if (!polltoken) {
            throw new Error('Failed to fetch polltoken');
        }

        const tokuri = encodeURIComponent(`polltoken:${polltoken}`);
        let fulluri = `https://${this.apiHost}/_rest/OAuth2:auth?response_type=code&client_id=${this.clientId}&redirect_uri=${tokuri}&scope=profile`;
        if (tokenCreate.xox) {
            fulluri = tokenCreate.xox;
        }

        console.log('Please open this URL in order to login:');
        console.log(fulluri);

        while (true) {
            const pollResult = await this._unauthRequest('POST', `OAuth2/App/${this.clientId}:token_poll`, { polltoken });

            if (!pollResult.response) {
                await sleep(1000);
                continue;
            }

            const code = pollResult.response.code;
            if (!code) {
                throw new Error('Invalid response from API, response not containing code');
            }

            const tokenResponse = await this._tokenExchange({
                client_id: this.clientId,
                grant_type: 'authorization_code',
                code: code
            });
            this.token = tokenResponse;
            this.token.ClientID = this.clientId;
            return;
        }
    }

    /**
     * Exchange the refresh_token for a fresh access_token. Throws if the
     * refresh fails — the caller should usually run login() again.
     */
    async renewToken() {
        if (!this.token || !this.token.refresh_token) {
            throw new Error('No refresh token is available and access token has expired');
        }
        const oldToken = this.token;
        this.token = null;
        try {
            const response = await this._tokenExchange({
                grant_type: 'refresh_token',
                client_id: oldToken.ClientID || this.clientId,
                refresh_token: oldToken.refresh_token
            });
            this.token = Object.assign({}, oldToken, response, {
                ClientID: oldToken.ClientID || this.clientId
            });
            if (this.filepath) {
                await this.save();
            }
        } catch (error) {
            this.token = oldToken;
            throw error;
        }
    }

    // ---------------------------------------------------------------------
    // Private helpers — these intentionally bypass the rest.js pipeline
    // because they need to run *without* an active access_token.

    _request(method, path, body, headers, isForm) {
        const https = require('https');
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.apiHost,
                path: this.apiBasePath + path,
                method: method,
                headers: Object.assign({}, headers || {})
            };

            let payload = '';
            if (body !== undefined && body !== null) {
                payload = isForm ? body : JSON.stringify(body);
                options.headers['Content-Length'] = Buffer.byteLength(payload);
                if (!options.headers['Content-Type']) {
                    options.headers['Content-Type'] = isForm
                        ? 'application/x-www-form-urlencoded'
                        : 'application/json';
                }
            }

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Invalid status code from server: ${res.statusCode}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(new Error(`Failed to parse response: ${err.message}`));
                    }
                });
            });
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    }

    async _unauthRequest(method, path, body) {
        const response = await this._request(method, path, body, { 'Sec-Rest-Http': 'false' }, false);
        if (response.result === 'error') {
            throw new Error(response.error || 'API error');
        }
        return response.data || response;
    }

    async _tokenExchange(params) {
        const { URLSearchParams } = require('url');
        const form = new URLSearchParams(params).toString();
        return this._request('POST', 'OAuth2:token', form, {
            'Content-Type': 'application/x-www-form-urlencoded'
        }, true);
    }
}

/**
 * Returns an auth provider that authenticates via the OAuth2 access_token
 * carried by an AuthInfo instance. Plug it into klbfw via setAuth().
 */
const bearerAuth = (authInfo) => ({
    name: 'bearer',
    authInfo: authInfo,

    applyToRequest(headers, _fetchOptions) {
        if (authInfo.token && authInfo.token.access_token) {
            headers['Authorization'] = 'Bearer ' + authInfo.token.access_token;
        }
        // Intentionally do NOT set credentials: 'include' — Node has no cookie jar.
    },

    refreshIfNeeded() {
        // No proactive refresh — the API tells us when the token is gone.
        return Promise.resolve();
    },

    async handleExpiredError(error) {
        if (!isExpiredTokenError(error)) return false;
        if (!authInfo.token || !authInfo.token.refresh_token) return false;
        try {
            await authInfo.renewToken();
            return true;
        } catch (_) {
            return false;
        }
    }
});

const isExpiredTokenError = (error) => {
    if (!error) return false;
    if (error.token === 'error_login_required') return true;
    if (error.token === 'invalid_request_token' && error.extra === 'token_expired') return true;
    return false;
};

module.exports.AuthInfo = AuthInfo;
module.exports.bearerAuth = bearerAuth;
