'use strict';
/**
 * @fileoverview Internal helpers for the KLB Frontend Framework
 * 
 * This module provides internal utility functions for REST API interactions,
 * timezone handling, and response parsing.
 */

const fwWrapper = require('./fw-wrapper');

/**
 * Pads a number with leading zeros
 * @param {number} number - The number to pad
 * @param {number} length - The desired length of the result
 * @returns {string} The padded number
 */
const padNumber = (number, length) => {
    let str = String(number);
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
};

/**
 * Gets timezone data in a format suitable for API calls
 * @returns {string} Formatted timezone string
 */
const getTimezoneData = () => {
    // Grab current offset value & build string
    const offset = new Date().getTimezoneOffset();
    const sign = offset < 0 ? '+' : '-'; // Note the reversed sign!
    const formattedOffset = sign + 
        padNumber(parseInt(Math.abs(offset / 60)), 2) +
        padNumber(Math.abs(offset % 60), 2);

    // Check if we have Intl info
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat !== undefined) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone + ";" + formattedOffset;
    }

    return formattedOffset;
};

/**
 * Constructs a REST API URL
 * @param {string} path - API endpoint path
 * @param {boolean} withToken - Whether to include authentication token
 * @param {Object} context - Context object with additional parameters
 * @returns {string} Constructed URL
 */
const buildRestUrl = (path, withToken, context) => {
    // Check for api_prefix
    const apiPrefixPath = typeof FW !== "undefined" && FW.api_prefix ? 
        FW.api_prefix + "/_rest/" + path : 
        "/_rest/" + path;
    
    // For non-authenticated requests
    if (!withToken) {
        const prefix = fwWrapper.getCallUrlPrefix();
        if (prefix) {
            return prefix + apiPrefixPath;
        }
        return apiPrefixPath;
    }
    
    context = context || {};
    let glue = '?';
    
    // Start building the URL
    let callUrl;
    if (fwWrapper.getSiteStatic()) {
        callUrl = apiPrefixPath + "?static";
        glue = '&';
    } else {
        callUrl = apiPrefixPath;
    }
    
    // Add call_url_prefix if it exists
    const prefix = fwWrapper.getCallUrlPrefix();
    if (prefix) {
        callUrl = prefix + callUrl;
    }

    // Copy context, proceed with overload then add to url
    const ctxFinal = fwWrapper.getContext();
    for (const key in context) {
        ctxFinal[key] = context[key];
    }
    
    // Add context parameters to URL
    for (const key in ctxFinal) {
        if (key === "_") continue;
        callUrl = callUrl + glue + "_ctx[" + key + "]=" + encodeURIComponent(ctxFinal[key]);
        glue = '&';
    }
    
    return callUrl;
};

/**
 * Checks if the environment supports required features
 * @returns {boolean} Whether the environment is supported
 */
const checkSupport = () => {
    const missingFeatures = [];
    
    if (typeof fetch === "undefined") {
        missingFeatures.push("fetch API");
    }

    if (!fwWrapper.supported()) {
        missingFeatures.push("Framework wrapper");
    }
    
    if (missingFeatures.length > 0) {
        console.error("Missing required features: " + missingFeatures.join(", "));
        return false;
    }
    
    return true;
};

/**
 * Makes an internal REST API call
 * @param {string} name - API endpoint name
 * @param {string} verb - HTTP method (GET, POST, etc.)
 * @param {Object|string} params - Request parameters
 * @param {Object} context - Context object with additional parameters
 * @returns {Promise} Fetch promise
 */
const internalRest = (name, verb, params, context) => {
    verb = verb || "GET";
    params = params || {};
    context = context || {};

    if (typeof window !== "undefined") {
        context['t'] = getTimezoneData();
    }
    
    const callUrl = buildRestUrl(name, true, context);
    const headers = {};
    
    if (fwWrapper.getToken() !== '') {
        headers['Authorization'] = 'Session ' + fwWrapper.getToken();
    }

    // Handle GET requests
    if (verb === "GET") {
        if (params) {
            // Check if params is a JSON string, or if it needs encoding
            if (typeof params === "string") {
                return fetch(callUrl + "&_=" + encodeURIComponent(params), {
                    method: verb, 
                    credentials: 'include', 
                    headers: headers
                });
            } else {
                return fetch(callUrl + "&_=" + encodeURIComponent(JSON.stringify(params)), {
                    method: verb, 
                    credentials: 'include', 
                    headers: headers
                });
            }
        }
        
        return fetch(callUrl, {
            method: verb, 
            credentials: 'include', 
            headers: headers
        });
    }

    // Handle FormData
    if (typeof FormData !== "undefined" && (params instanceof FormData)) {
        return fetch(callUrl, {
            method: verb,
            credentials: 'include',
            body: params,
            headers: headers
        });
    }

    // Handle JSON requests
    headers['Content-Type'] = 'application/json; charset=utf-8';
    
    return fetch(callUrl, {
        method: verb,
        credentials: 'include',
        body: JSON.stringify(params),
        headers: headers
    });
};

/**
 * Parses API response and resolves/rejects accordingly
 * @param {Response} response - Fetch Response object
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
const responseParse = (response, resolve, reject) => {
    // Check if response is ok (status 200-299)
    if (!response.ok) {
        reject({
            message: `HTTP Error: ${response.status} ${response.statusText}`,
            status: response.status, 
            headers: response.headers
        });
        return;
    }
    
    const contentType = response.headers.get("content-type");
    if (!contentType || contentType.indexOf("application/json") === -1) {
        response.text()
            .then(text => {
                reject({
                    message: "Not JSON", 
                    body: text, 
                    headers: response.headers
                });
            })
            .catch(error => reject(error));
        return;
    }

    response.json()
        .then(json => {
            // Check for gtag
            if (json.gtag && typeof window !== "undefined" && window.gtag) {
                json.gtag.map(item => window.gtag.apply(null, item));
            }
            
            // Check for result
            if (json.result !== "success" && json.result !== "redirect") {
                json.headers = response.headers;
                reject(json);
            } else {
                resolve(json);
            }
        })
        .catch(error => reject(error));
};

// Backward compatibility aliases
module.exports.get_tz_pad = padNumber;
module.exports.get_timezone_data = getTimezoneData;
module.exports.rest_url = buildRestUrl;
module.exports.internal_rest = internalRest;
module.exports.checkSupport = checkSupport;
module.exports.responseParse = responseParse;

// New exports with camelCase naming
module.exports.padNumber = padNumber;
module.exports.getTimezoneData = getTimezoneData;
module.exports.buildRestUrl = buildRestUrl;
module.exports.internalRest = internalRest;