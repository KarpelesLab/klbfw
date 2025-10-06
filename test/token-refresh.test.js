'use strict';

const { setupClientMode, resetMocks } = require('./setup');

// We need to test the actual internal module with real implementation
// So we'll require it after setting up mocks
describe('Token Refresh', () => {
    let internal;
    let fwWrapper;

    beforeEach(() => {
        resetMocks();
        setupClientMode();

        // Clear the module cache to get fresh instances
        jest.resetModules();

        // Require modules fresh
        internal = require('../internal');
        fwWrapper = require('../fw-wrapper');

        // Set up fetch mock for token refresh endpoint
        global.fetch = jest.fn();
    });

    describe('checkAndRefreshToken', () => {
        test('should not refresh when token_exp is undefined', async () => {
            // Setup: no token_exp
            global.FW.token = 'test-token';
            global.FW.token_exp = undefined;

            // Mock internalRest to capture calls
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockImplementation(() => {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest which should check token
            await internal.internalRest('test', 'GET', {});

            // Should not have called the token refresh endpoint
            const tokenRefreshCalls = global.fetch.mock.calls.filter(call =>
                call[0].includes('_special/token.json')
            );
            expect(tokenRefreshCalls.length).toBe(0);
        });

        test('should not refresh when token is not expiring soon', async () => {
            // Setup: token expires in 10 minutes (not soon)
            const tenMinutesFromNow = Date.now() + (10 * 60 * 1000);
            global.FW.token = 'test-token';
            global.FW.token_exp = tenMinutesFromNow;

            global.fetch = jest.fn().mockImplementation(() => {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Should not have called the token refresh endpoint
            const tokenRefreshCalls = global.fetch.mock.calls.filter(call =>
                call[0].includes('_special/token.json')
            );
            expect(tokenRefreshCalls.length).toBe(0);
        });

        test('should refresh when token expires within 5 minutes', async () => {
            // Setup: token expires in 4 minutes
            const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);
            const newTokenExp = Date.now() + (60 * 60 * 1000); // 1 hour from now

            global.FW.token = 'old-token';
            global.FW.token_exp = fourMinutesFromNow;

            let callCount = 0;
            global.fetch = jest.fn().mockImplementation((url) => {
                callCount++;

                // First call is token refresh
                if (url.includes('_special/token.json')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: {
                            get: () => 'application/json'
                        },
                        json: () => Promise.resolve({
                            token: 'new-token',
                            token_exp: newTokenExp
                        })
                    });
                }

                // Second call is the actual API call
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Should have refreshed the token
            expect(global.FW.token).toBe('new-token');
            expect(global.FW.token_exp).toBe(newTokenExp);

            // Should have made 2 calls: token refresh + actual API call
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        test('should set token_exp to undefined when refresh fails', async () => {
            // Setup: token expires in 4 minutes
            const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);

            global.FW.token = 'old-token';
            global.FW.token_exp = fourMinutesFromNow;

            global.fetch = jest.fn().mockImplementation((url) => {
                // Token refresh fails
                if (url.includes('_special/token.json')) {
                    return Promise.resolve({
                        ok: false,
                        status: 401,
                        headers: {
                            get: () => 'application/json'
                        },
                        json: () => Promise.resolve({ result: 'error', error: 'Unauthorized' })
                    });
                }

                // Actual API call
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Token should remain the same but token_exp should be undefined
            expect(global.FW.token).toBe('old-token');
            expect(global.FW.token_exp).toBeUndefined();
        });

        test('should set token_exp to undefined when refresh returns non-JSON', async () => {
            // Setup: token expires in 4 minutes
            const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);

            global.FW.token = 'old-token';
            global.FW.token_exp = fourMinutesFromNow;

            global.fetch = jest.fn().mockImplementation((url) => {
                // Token refresh returns non-JSON
                if (url.includes('_special/token.json')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: {
                            get: () => 'text/html'
                        },
                        text: () => Promise.resolve('<html>Error</html>')
                    });
                }

                // Actual API call
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Token should remain the same but token_exp should be undefined
            expect(global.FW.token).toBe('old-token');
            expect(global.FW.token_exp).toBeUndefined();
        });

        test('should set token_exp to undefined when refresh returns invalid data', async () => {
            // Setup: token expires in 4 minutes
            const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);

            global.FW.token = 'old-token';
            global.FW.token_exp = fourMinutesFromNow;

            global.fetch = jest.fn().mockImplementation((url) => {
                // Token refresh returns invalid data (missing fields)
                if (url.includes('_special/token.json')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: {
                            get: () => 'application/json'
                        },
                        json: () => Promise.resolve({ some_other_field: 'value' })
                    });
                }

                // Actual API call
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Token should remain the same but token_exp should be undefined
            expect(global.FW.token).toBe('old-token');
            expect(global.FW.token_exp).toBeUndefined();
        });

        test('should set token_exp to undefined when refresh throws error', async () => {
            // Setup: token expires in 4 minutes
            const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);

            global.FW.token = 'old-token';
            global.FW.token_exp = fourMinutesFromNow;

            global.fetch = jest.fn().mockImplementation((url) => {
                // Token refresh throws network error
                if (url.includes('_special/token.json')) {
                    return Promise.reject(new Error('Network error'));
                }

                // Actual API call
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => 'application/json'
                    },
                    json: () => Promise.resolve({ result: 'success', data: {} })
                });
            });

            // Call internalRest
            await internal.internalRest('test', 'GET', {});

            // Token should remain the same but token_exp should be undefined
            expect(global.FW.token).toBe('old-token');
            expect(global.FW.token_exp).toBeUndefined();
        });
    });
});
