'use strict';

const { setupClientMode, resetMocks } = require('./setup');

describe('Auth abstraction', () => {
    let auth;
    let internal;
    let rest;
    let fwWrapper;

    beforeEach(() => {
        resetMocks();
        setupClientMode();
        jest.resetModules();

        auth = require('../auth');
        internal = require('../internal');
        rest = require('../rest');
        fwWrapper = require('../fw-wrapper');

        global.fetch = jest.fn();
    });

    afterEach(() => {
        // Restore default to avoid bleed between tests.
        auth.setAuth(null);
    });

    describe('default sessionAuth', () => {
        test('getAuth() returns sessionAuth before any setAuth call', () => {
            expect(auth.getAuth()).toBe(auth.sessionAuth);
        });

        test('applies Session header and credentials: include', () => {
            const headers = {};
            const fetchOptions = {};
            global.FW.token = 'session-xyz';

            auth.sessionAuth.applyToRequest(headers, fetchOptions);

            expect(headers['Authorization']).toBe('Session session-xyz');
            expect(fetchOptions.credentials).toBe('include');
        });

        test('refreshIfNeeded short-circuits when token_exp is undefined', async () => {
            global.FW.token = 'tok';
            global.FW.token_exp = undefined;

            await auth.sessionAuth.refreshIfNeeded();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('refreshIfNeeded fetches /_special/token.json near expiry', async () => {
            global.FW.token = 'old';
            global.FW.token_exp = Date.now() + 60 * 1000; // 1 min
            const newExp = Date.now() + 60 * 60 * 1000;

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ token: 'new', token_exp: newExp })
            });

            await auth.sessionAuth.refreshIfNeeded();

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch.mock.calls[0][0]).toMatch(/_special\/token\.json/);
            expect(global.FW.token).toBe('new');
            expect(global.FW.token_exp).toBe(newExp);
        });

        test('handleExpiredError always returns false', async () => {
            const refreshed = await auth.sessionAuth.handleExpiredError({ token: 'error_login_required' });
            expect(refreshed).toBe(false);
        });
    });

    describe('setAuth / getAuth', () => {
        test('swaps the active provider', () => {
            const custom = {
                name: 'custom',
                applyToRequest: jest.fn(),
                refreshIfNeeded: () => Promise.resolve(),
                handleExpiredError: () => Promise.resolve(false)
            };
            auth.setAuth(custom);
            expect(auth.getAuth()).toBe(custom);
        });

        test('setAuth(null) restores the default sessionAuth', () => {
            auth.setAuth({
                name: 'tmp',
                applyToRequest() {},
                refreshIfNeeded() { return Promise.resolve(); },
                handleExpiredError() { return Promise.resolve(false); }
            });
            auth.setAuth(null);
            expect(auth.getAuth()).toBe(auth.sessionAuth);
        });

        test('internalRest delegates header/credential setup to the active provider', async () => {
            const calls = [];
            const custom = {
                name: 'custom',
                applyToRequest(headers, fetchOptions) {
                    headers['Authorization'] = 'Bearer xyz';
                    fetchOptions.credentials = 'omit';
                    calls.push({ headers: { ...headers }, fetchOptions: { ...fetchOptions } });
                },
                refreshIfNeeded: () => Promise.resolve(),
                handleExpiredError: () => Promise.resolve(false)
            };
            auth.setAuth(custom);

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ result: 'success', data: {} })
            });

            await internal.internalRest('Misc/Debug:fixedString', 'GET', {});

            expect(calls.length).toBe(1);
            const fetchCall = global.fetch.mock.calls[0];
            expect(fetchCall[1].headers['Authorization']).toBe('Bearer xyz');
            expect(fetchCall[1].credentials).toBe('omit');
        });

        test('rest() retries once after handleExpiredError returns true', async () => {
            let renewed = false;
            const provider = {
                name: 'retrying',
                applyToRequest(headers, fetchOptions) {
                    headers['Authorization'] = renewed ? 'Bearer new' : 'Bearer old';
                    fetchOptions.credentials = 'omit';
                },
                refreshIfNeeded: () => Promise.resolve(),
                handleExpiredError: jest.fn().mockImplementation(async () => {
                    renewed = true;
                    return true;
                })
            };
            auth.setAuth(provider);

            let call = 0;
            global.fetch = jest.fn().mockImplementation(() => {
                call++;
                if (call === 1) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: { get: () => 'application/json' },
                        json: () => Promise.resolve({
                            result: 'error',
                            error: 'token expired',
                            token: 'invalid_request_token',
                            extra: 'token_expired'
                        })
                    });
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: { get: () => 'application/json' },
                    json: () => Promise.resolve({ result: 'success', data: { ok: true } })
                });
            });

            const result = await rest.rest('Misc/Debug:fixedString', 'GET', {});

            expect(provider.handleExpiredError).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(result.data).toEqual({ ok: true });
            expect(global.fetch.mock.calls[1][1].headers['Authorization']).toBe('Bearer new');
        });

        test('rest() does not retry when handleExpiredError returns false', async () => {
            const provider = {
                name: 'no-retry',
                applyToRequest(headers) { headers['Authorization'] = 'Session t'; },
                refreshIfNeeded: () => Promise.resolve(),
                handleExpiredError: jest.fn().mockResolvedValue(false)
            };
            auth.setAuth(provider);

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({ result: 'error', error: 'nope' })
            });

            await expect(rest.rest('Misc/Debug:fixedString', 'GET', {})).rejects.toMatchObject({
                result: 'error',
                error: 'nope'
            });
            expect(provider.handleExpiredError).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});

describe('bearerAuth', () => {
    let auth;
    let bearerAuth;

    beforeEach(() => {
        jest.resetModules();
        auth = require('../auth');
        ({ bearerAuth } = require('../auth-node'));
    });

    afterEach(() => {
        auth.setAuth(null);
    });

    test('applyToRequest sets Bearer header and leaves credentials alone', () => {
        const info = { token: { access_token: 'abc' } };
        const provider = bearerAuth(info);
        const headers = {};
        const fetchOptions = {};

        provider.applyToRequest(headers, fetchOptions);

        expect(headers['Authorization']).toBe('Bearer abc');
        expect(fetchOptions.credentials).toBeUndefined();
    });

    test('applyToRequest skips header when token is missing', () => {
        const provider = bearerAuth({ token: null });
        const headers = {};
        provider.applyToRequest(headers, {});
        expect(headers['Authorization']).toBeUndefined();
    });

    test('handleExpiredError refreshes on token_expired and returns true', async () => {
        const info = {
            token: { access_token: 'old', refresh_token: 'r' },
            renewToken: jest.fn().mockResolvedValue()
        };
        const provider = bearerAuth(info);

        const refreshed = await provider.handleExpiredError({
            token: 'invalid_request_token',
            extra: 'token_expired'
        });

        expect(refreshed).toBe(true);
        expect(info.renewToken).toHaveBeenCalled();
    });

    test('handleExpiredError refreshes on error_login_required', async () => {
        const info = {
            token: { access_token: 'old', refresh_token: 'r' },
            renewToken: jest.fn().mockResolvedValue()
        };
        const provider = bearerAuth(info);

        expect(await provider.handleExpiredError({ token: 'error_login_required' })).toBe(true);
    });

    test('handleExpiredError returns false on unrelated errors', async () => {
        const info = {
            token: { access_token: 'old', refresh_token: 'r' },
            renewToken: jest.fn()
        };
        const provider = bearerAuth(info);

        expect(await provider.handleExpiredError({ token: 'something_else' })).toBe(false);
        expect(info.renewToken).not.toHaveBeenCalled();
    });

    test('handleExpiredError returns false if renewToken throws', async () => {
        const info = {
            token: { access_token: 'old', refresh_token: 'r' },
            renewToken: jest.fn().mockRejectedValue(new Error('refresh failed'))
        };
        const provider = bearerAuth(info);

        expect(await provider.handleExpiredError({ token: 'error_login_required' })).toBe(false);
    });

    test('handleExpiredError returns false if no refresh_token', async () => {
        const info = {
            token: { access_token: 'old' },
            renewToken: jest.fn()
        };
        const provider = bearerAuth(info);

        expect(await provider.handleExpiredError({ token: 'error_login_required' })).toBe(false);
        expect(info.renewToken).not.toHaveBeenCalled();
    });
});
