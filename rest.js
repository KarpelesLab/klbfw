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

// Export new camelCase API
module.exports.rest = rest;
module.exports.restGet = restGet;

// Backward compatibility
module.exports.rest_get = restGet;