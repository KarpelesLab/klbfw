'use strict';
/**
 * @fileoverview Pluggable auth provider for KLB Frontend Framework
 *
 * The default `sessionAuth` provider preserves browser behavior: the FW
 * session token is sent as an `Authorization: Session <token>` header and
 * fetch requests use `credentials: 'include'` so the session cookie travels
 * with each call.
 *
 * Node.js applications cannot use session cookies. They should require
 * `@karpeleslab/klbfw/auth-node` and call `setAuth(bearerAuth(authInfo))`
 * once at startup. All `rest()`, `restGet()`, `restSSE()` and `uploadFile()`
 * calls then send a Bearer token instead.
 *
 * An auth provider implements:
 *   - applyToRequest(headers, fetchOptions): mutate headers / fetch options
 *   - refreshIfNeeded(): Promise resolving once the token is fresh
 *   - handleExpiredError(error): Promise<boolean> — true to retry
 */

const fwWrapper = require('./fw-wrapper');

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Default auth provider — browser session cookie + FW.token.
 * Behavior matches the pre-auth-abstraction inline logic.
 */
const sessionAuth = {
    name: 'session',

    applyToRequest(headers, fetchOptions) {
        const token = fwWrapper.getToken();
        if (token !== '') {
            headers['Authorization'] = 'Session ' + token;
        }
        fetchOptions.credentials = 'include';
    },

    refreshIfNeeded() {
        const tokenExp = fwWrapper.getTokenExp();

        if (tokenExp === undefined) {
            return Promise.resolve();
        }

        if (tokenExp - Date.now() > FIVE_MINUTES) {
            return Promise.resolve();
        }

        // Lazy require to break circular load with internal.js
        const internal = require('./internal');
        const callUrl = internal.buildRestUrl('_special/token.json', true);

        const headers = {};
        const token = fwWrapper.getToken();
        if (token !== '') {
            headers['Authorization'] = 'Session ' + token;
        }

        return fetch(callUrl, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        })
        .then(response => {
            if (!response.ok) {
                fwWrapper.setToken(fwWrapper.getToken(), undefined);
                return;
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || contentType.indexOf('application/json') === -1) {
                fwWrapper.setToken(fwWrapper.getToken(), undefined);
                return;
            }

            return response.json();
        })
        .then(json => {
            if (json && json.token && json.token_exp) {
                fwWrapper.setToken(json.token, json.token_exp);
            } else {
                fwWrapper.setToken(fwWrapper.getToken(), undefined);
            }
        })
        .catch(() => {
            fwWrapper.setToken(fwWrapper.getToken(), undefined);
        });
    },

    handleExpiredError(_error) {
        // Browser sessions can't silently re-authenticate.
        return Promise.resolve(false);
    }
};

let currentAuth = sessionAuth;

/**
 * Replaces the active auth provider for all subsequent rest()/upload calls.
 * Pass null/undefined to restore the default sessionAuth.
 */
const setAuth = (auth) => {
    currentAuth = auth || sessionAuth;
};

/** Returns the current active auth provider. */
const getAuth = () => currentAuth;

module.exports.sessionAuth = sessionAuth;
module.exports.setAuth = setAuth;
module.exports.getAuth = getAuth;
