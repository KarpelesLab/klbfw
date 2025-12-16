'use strict';
/**
 * @fileoverview REST API client for KLB Frontend Framework
 * 
 * This module provides functions for making REST API calls to KLB backend services.
 */

const internal = require('./internal');
const fwWrapper = require('./fw-wrapper');

/**
 * Handles platform-specific API calls
 * @param {string} name - API endpoint name
 * @param {string} verb - HTTP method (GET, POST, etc.)
 * @param {Object} params - Request parameters
 * @param {Object} context - Context object with additional parameters
 * @returns {Promise} API response promise
 */
const handlePlatformCall = (name, verb, params, context) => {
    // For platform-specific REST implementations
    if (typeof __platformAsyncRest !== "undefined") {
        context = context || {};
        const ctxFinal = fwWrapper.getContext();
        
        // Merge context
        for (const key in context) {
            ctxFinal[key] = context[key];
        }
        
        return new Promise((resolve, reject) => {
            __platformAsyncRest(name, verb, params, ctxFinal)
                .then(result => {
                    if (result.result !== "success" && result.result !== "redirect") {
                        reject(result);
                    } else {
                        resolve(result);
                    }
                })
                .catch(error => {
                    reject(error || new Error('Unknown platform async error'));
                });
        });
    }
    
    // For legacy platform REST implementation
    if (typeof __platformRest !== "undefined") {
        return new Promise((resolve, reject) => {
            __platformRest(name, verb, params, (res, err) => {
                if (err) {
                    reject(err);
                } else if (res.result !== "success") {
                    reject(res);
                } else {
                    resolve(res);
                }
            });
        });
    }
    
    return null;
};

/**
 * Makes a REST API call
 * @param {string} name - API endpoint name
 * @param {string} verb - HTTP method (GET, POST, etc.)
 * @param {Object} params - Request parameters
 * @param {Object} context - Context object with additional parameters
 * @returns {Promise} API response promise
 */
const rest = (name, verb, params, context) => {
    // Try platform-specific REST implementations first
    const platformResult = handlePlatformCall(name, verb, params, context);
    if (platformResult) {
        return platformResult;
    }

    // Fall back to standard fetch implementation
    if (!internal.checkSupport()) {
        return Promise.reject(new Error('Environment not supported'));
    }

    return new Promise((resolve, reject) => {
        const handleSuccess = data => {
            internal.responseParse(data, resolve, reject);
        };
        
        const handleError = data => {
            reject(data);
        };
        
        const handleException = error => {
            console.error(error);
            // TODO: Add proper error logging
        };

        internal.internalRest(name, verb, params, context)
            .then(handleSuccess, handleError)
            .catch(handleException);
    });
};

/**
 * Makes a GET request to the REST API
 * @param {string} name - API endpoint name
 * @param {Object} params - Request parameters
 * @returns {Promise} API response promise
 */
const restGet = (name, params) => {
    // Try platform-specific REST implementations first
    const platformResult = handlePlatformCall(name, "GET", params);
    if (platformResult) {
        return platformResult;
    }

    // Fall back to standard fetch implementation
    if (!internal.checkSupport()) {
        return Promise.reject(new Error('Environment not supported'));
    }

    params = params || {};
    let callUrl = internal.buildRestUrl(name, false);

    if (params) {
        // Check if params is a JSON string, or if it needs encoding
        if (typeof params === "string") {
            callUrl += "?_=" + encodeURIComponent(params);
        } else {
            callUrl += "?_=" + encodeURIComponent(JSON.stringify(params));
        }
    }

    return new Promise((resolve, reject) => {
        const handleSuccess = data => {
            internal.responseParse(data, resolve, reject);
        };
        
        const handleError = data => {
            reject(data);
        };
        
        const handleException = error => {
            console.error(error);
            // TODO: Add proper error logging
        };

        fetch(callUrl, {
            method: 'GET',
            credentials: 'include'
        })
        .then(handleSuccess, handleError)
        .catch(handleException);
    });
};

/**
 * Parses a single SSE event from text
 * @param {string} eventText - The raw SSE event text
 * @returns {Object} Parsed event object with type, data, id, and retry fields
 */
const parseSSEEvent = (eventText) => {
    const event = {
        type: 'message',
        data: '',
        id: null,
        retry: null
    };

    const lines = eventText.split('\n');
    const dataLines = [];

    for (const line of lines) {
        if (line === '') continue;

        // Handle lines with field:value format
        const colonIndex = line.indexOf(':');

        if (colonIndex === 0) {
            // Comment line (starts with :), skip
            continue;
        }

        let field, value;
        if (colonIndex === -1) {
            // Field with no value
            field = line;
            value = '';
        } else {
            field = line.substring(0, colonIndex);
            // Skip the optional space after colon
            value = line.substring(colonIndex + 1);
            if (value.charAt(0) === ' ') {
                value = value.substring(1);
            }
        }

        switch (field) {
            case 'event':
                event.type = value;
                break;
            case 'data':
                dataLines.push(value);
                break;
            case 'id':
                event.id = value;
                break;
            case 'retry':
                const retryMs = parseInt(value, 10);
                if (!isNaN(retryMs)) {
                    event.retry = retryMs;
                }
                break;
        }
    }

    // Join data lines with newlines (per SSE spec)
    event.data = dataLines.join('\n');

    return event;
};

/**
 * Makes a REST API request that handles SSE streaming responses
 * @param {string} name - API endpoint name
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} params - Request parameters
 * @param {Object} [context] - Context object with additional parameters
 * @returns {Object} EventSource-like object with onmessage, onerror, addEventListener, close
 */
const restSSE = (name, method, params, context) => {
    const abortController = new AbortController();

    method = method || 'GET';
    params = params || {};
    context = context || {};

    // EventSource-like object
    const eventSource = {
        onopen: null,
        onmessage: null,
        onerror: null,
        readyState: 0, // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
        CONNECTING: 0,
        OPEN: 1,
        CLOSED: 2,
        _listeners: {},

        addEventListener: function(type, listener) {
            if (!this._listeners[type]) {
                this._listeners[type] = [];
            }
            this._listeners[type].push(listener);
        },

        removeEventListener: function(type, listener) {
            if (!this._listeners[type]) return;
            const idx = this._listeners[type].indexOf(listener);
            if (idx !== -1) {
                this._listeners[type].splice(idx, 1);
            }
        },

        dispatchEvent: function(event) {
            // Call type-specific handler (onmessage, onerror, etc.)
            const handlerName = 'on' + event.type;
            if (typeof this[handlerName] === 'function') {
                this[handlerName](event);
            }

            // Call addEventListener listeners
            const listeners = this._listeners[event.type];
            if (listeners) {
                for (const listener of listeners) {
                    listener(event);
                }
            }
        },

        close: function() {
            this.readyState = 2;
            abortController.abort();
        }
    };

    if (!internal.checkSupport()) {
        setTimeout(() => {
            eventSource.readyState = 2;
            eventSource.dispatchEvent({ type: 'error', error: new Error('Environment not supported') });
        }, 0);
        return eventSource;
    }

    // Add timezone data if in browser
    if (typeof window !== 'undefined') {
        context['t'] = internal.getTimezoneData();
    }

    let callUrl = internal.buildRestUrl(name, true, context);
    const headers = {
        'Accept': 'text/event-stream, application/json'
    };

    const token = fwWrapper.getToken();
    if (token && token !== '') {
        headers['Authorization'] = 'Session ' + token;
    }

    // Build fetch options based on method
    const fetchOptions = {
        method: method,
        credentials: 'include',
        headers: headers,
        signal: abortController.signal
    };

    if (method === 'GET') {
        // For GET requests, add params to URL
        if (params && Object.keys(params).length > 0) {
            const glue = callUrl.indexOf('?') === -1 ? '?' : '&';
            if (typeof params === 'string') {
                callUrl += glue + '_=' + encodeURIComponent(params);
            } else {
                callUrl += glue + '_=' + encodeURIComponent(JSON.stringify(params));
            }
        }
    } else {
        // For other methods, add params to body as JSON
        headers['Content-Type'] = 'application/json; charset=utf-8';
        fetchOptions.body = JSON.stringify(params);
    }

    // Helper to dispatch SSE events
    const dispatchSSEEvent = (parsedEvent) => {
        const event = {
            type: parsedEvent.type,
            data: parsedEvent.data,
            lastEventId: parsedEvent.id || '',
            origin: ''
        };

        // For 'message' type, use onmessage
        if (parsedEvent.type === 'message') {
            eventSource.dispatchEvent(event);
        } else {
            // For custom event types, dispatch to both the specific type and as a generic event
            eventSource.dispatchEvent(event);
        }
    };

    // Check and refresh token if needed, then make the request
    internal.checkAndRefreshToken().then(() => {
        fetch(callUrl, fetchOptions)
        .then(response => {
            if (!response.ok) {
                // Handle HTTP errors
                const contentType = response.headers.get('content-type') || '';
                if (contentType.indexOf('application/json') !== -1) {
                    return response.json().then(json => {
                        json.headers = response.headers;
                        json.status = response.status;
                        throw json;
                    });
                }
                throw {
                    message: `HTTP Error: ${response.status} ${response.statusText}`,
                    status: response.status,
                    headers: response.headers
                };
            }

            // Connection is now open
            eventSource.readyState = 1;
            eventSource.dispatchEvent({ type: 'open' });

            const contentType = response.headers.get('content-type') || '';

            // Check if response is SSE
            if (contentType.indexOf('text/event-stream') !== -1) {
                // Stream SSE events
                let buffer = '';

                const processData = (chunk) => {
                    buffer += chunk;

                    // SSE events are separated by double newlines
                    const events = buffer.split(/\n\n/);

                    // Keep the last incomplete event in the buffer
                    buffer = events.pop() || '';

                    // Process complete events
                    for (const eventText of events) {
                        if (eventText.trim()) {
                            const parsed = parseSSEEvent(eventText);
                            if (parsed.data || parsed.type !== 'message') {
                                dispatchSSEEvent(parsed);
                            }
                        }
                    }
                };

                const processEnd = () => {
                    // Process any remaining data in buffer
                    if (buffer.trim()) {
                        const parsed = parseSSEEvent(buffer);
                        if (parsed.data || parsed.type !== 'message') {
                            dispatchSSEEvent(parsed);
                        }
                    }
                    eventSource.readyState = 2;
                };

                // Check if we have a web ReadableStream (browser) or Node.js stream
                if (response.body && typeof response.body.getReader === 'function') {
                    // Browser environment - use ReadableStream API
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    const processStream = () => {
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                processEnd();
                                return;
                            }

                            processData(decoder.decode(value, { stream: true }));

                            // Continue reading
                            processStream();
                        }).catch(err => {
                            if (err.name !== 'AbortError') {
                                eventSource.dispatchEvent({ type: 'error', error: err });
                            }
                            eventSource.readyState = 2;
                        });
                    };

                    processStream();
                } else if (response.body && typeof response.body.on === 'function') {
                    // Node.js environment - use Node stream API
                    response.body.on('data', (chunk) => {
                        processData(chunk.toString());
                    });

                    response.body.on('end', () => {
                        processEnd();
                    });

                    response.body.on('error', (err) => {
                        // Handle abort errors gracefully
                        if (err.type !== 'aborted' && err.name !== 'AbortError') {
                            eventSource.dispatchEvent({ type: 'error', error: err });
                        }
                        eventSource.readyState = 2;
                    });
                } else {
                    // Fallback - read entire body as text
                    response.text().then(text => {
                        processData(text);
                        processEnd();
                    }).catch(err => {
                        eventSource.dispatchEvent({ type: 'error', error: err });
                        eventSource.readyState = 2;
                    });
                }
            } else if (contentType.indexOf('application/json') !== -1) {
                // Non-SSE JSON response - emit as single event
                response.json().then(json => {
                    // Check for gtag (consistent with responseParse)
                    if (json.gtag && typeof window !== 'undefined' && window.gtag) {
                        json.gtag.map(item => window.gtag.apply(null, item));
                    }

                    dispatchSSEEvent({
                        type: 'message',
                        data: JSON.stringify(json),
                        id: null
                    });
                    eventSource.readyState = 2;
                }).catch(err => {
                    eventSource.dispatchEvent({ type: 'error', error: err });
                    eventSource.readyState = 2;
                });
            } else {
                // Other content types - emit raw text as single event
                response.text().then(text => {
                    dispatchSSEEvent({
                        type: 'message',
                        data: text,
                        id: null
                    });
                    eventSource.readyState = 2;
                }).catch(err => {
                    eventSource.dispatchEvent({ type: 'error', error: err });
                    eventSource.readyState = 2;
                });
            }
        })
        .catch(err => {
            if (err.name !== 'AbortError') {
                eventSource.dispatchEvent({ type: 'error', error: err });
            }
            eventSource.readyState = 2;
        });
    }).catch(err => {
        eventSource.dispatchEvent({ type: 'error', error: err });
        eventSource.readyState = 2;
    });

    return eventSource;
};

// Export new camelCase API
module.exports.rest = rest;
module.exports.restGet = restGet;
module.exports.restSSE = restSSE;

// Backward compatibility
module.exports.rest_get = restGet;