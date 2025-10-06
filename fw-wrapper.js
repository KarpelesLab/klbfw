'use strict';
/**
 * @fileoverview Framework wrapper for KLB Frontend Framework
 * 
 * This module provides a wrapper around the global FW object,
 * providing safe access to its properties with fallbacks for
 * environments where FW is not available.
 */

/**
 * Gets a property from the global FW object with fallback
 * @private
 * @param {string} property - FW property to retrieve
 * @param {*} fallback - Fallback value if property is not available
 * @returns {*} The property value or fallback
 */
const getFWProperty = (property, fallback) => {
    if (typeof FW === "undefined") return fallback;
    
    // Handle nested properties (e.g., "Context.c")
    if (property.includes('.')) {
        const parts = property.split('.');
        let obj = FW;
        
        for (const part of parts) {
            if (obj === undefined || obj === null) return fallback;
            obj = obj[part];
        }
        
        return obj !== undefined ? obj : fallback;
    }
    
    return FW[property] !== undefined ? FW[property] : fallback;
};

/**
 * Gets the site prefix
 * @returns {string} Site prefix
 */
const getPrefix = () => getFWProperty('prefix', '');

/**
 * Gets site settings
 * @returns {Object} Site settings
 */
const getSettings = () => getFWProperty('settings', {});

/**
 * Gets realm information
 * @returns {Object} Realm information
 */
const getRealm = () => getFWProperty('Realm', {});

/**
 * Gets the current locale
 * @returns {string} Current locale
 */
const getLocale = () => getFWProperty('Locale', 'en-US');

/**
 * Gets the current path
 * @returns {string} Current path
 */
const getPath = () => {
    if (typeof FW !== "undefined") return FW.path;
    if (typeof window !== "undefined") return window.location.pathname;
    return '/';
};

/**
 * Gets the current hostname
 * @returns {string} Current hostname
 */
const getHostname = () => {
    if (typeof FW !== "undefined") return FW.hostname;
    if (typeof window !== "undefined") return window.location.hostname;
    return '';
};

/**
 * Gets the current currency
 * @returns {string} Current currency code
 */
const getCurrency = () => getFWProperty('Context.c', 'USD');

/**
 * Gets a copy of the current context
 * @returns {Object} Current context
 */
const getContext = () => {
    if (typeof FW !== "undefined" && FW.Context) {
        return Object.assign({}, FW.Context);
    }
    return {};
};

/**
 * Sets a value in the context
 * @param {string} key - Context key
 * @param {*} value - Value to set
 */
const setContext = (key, value) => {
    if (typeof FW !== "undefined" && FW.Context) {
        FW.Context[key] = value;
    }
};

/**
 * Gets the current authentication token
 * @returns {string|undefined} Authentication token
 */
const getToken = () => getFWProperty('token', undefined);

/**
 * Gets the current token expiration time
 * @returns {number|undefined} Token expiration time in milliseconds
 */
const getTokenExp = () => getFWProperty('token_exp', undefined);

/**
 * Sets the authentication token and its expiration time
 * @param {string} token - New token value
 * @param {number|undefined} tokenExp - Token expiration time in milliseconds
 */
const setToken = (token, tokenExp) => {
    if (typeof FW !== 'undefined') {
        FW.token = token;
        FW.token_exp = tokenExp;
    }
};

/**
 * Gets the registry
 * @returns {Object|undefined} Registry object
 */
const getRegistry = () => getFWProperty('Registry', undefined);

/**
 * Gets URL information
 * @returns {Object} URL information with path, full, host, query, and scheme properties
 */
const getUrl = () => {
    if (typeof FW !== "undefined") return FW.URL;
    if (typeof window !== "undefined") {
        return {
            path: window.location.pathname,
            full: window.location.href,
            host: window.location.host,
            query: window.location.search,
            scheme: window.location.protocol.replace(':', '')
        };
    }
    return { 
        path: '/', 
        full: '/', 
        host: 'localhost',
        query: '',
        scheme: 'https'
    };
};

/**
 * Gets site static flag
 * @returns {boolean} Whether site is static
 */
const getSiteStatic = () => {
    if (typeof FW === "undefined") return true;
    return FW.site_static === undefined ? false : FW.site_static;
};

/**
 * Gets the API prefix
 * @returns {string|undefined} API prefix
 */
const getApiPrefix = () => {
    if (typeof FW !== "undefined") {
        return FW.api_prefix; // Return undefined if property doesn't exist
    }
    return undefined;
};

/**
 * Gets the API call URL prefix
 * @returns {string|undefined} API call URL prefix
 */
const getCallUrlPrefix = () => {
    // In original code, if FW existed but call_url_prefix wasn't set, it would return undefined
    if (typeof FW !== "undefined") {
        return FW.call_url_prefix; // Return undefined if property doesn't exist
    }
    // Only use fallback in non-browser environments
    return typeof window === "undefined" ? 'https://hub.atonline.com' : undefined;
};

/**
 * Gets the site UUID
 * @returns {string|undefined} Site UUID
 */
const getUuid = () => getFWProperty('uuid', undefined);

/**
 * Gets the initial state
 * @returns {Object|undefined} Initial state
 */
const getInitialState = () => getFWProperty('initial', undefined);

/**
 * Checks if the framework is supported
 * @returns {boolean} Whether the framework is supported
 */
const supported = () => true;

/**
 * Gets the current GET parameters
 * @returns {Object} GET parameters
 */
const getGET = () => {
    if (typeof FW !== "undefined") {
        return FW.GET !== undefined ? FW.GET : {};
    }
    if (typeof window !== "undefined") {
        const params = {};
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    }
    return {};
};

/**
 * Gets a specific GET parameter
 * @param {string} key - Parameter key
 * @returns {string|undefined} Parameter value
 */
const getParam = (key) => {
    if (key === undefined) {
        return getGET();
    }
    
    const params = getGET();
    return params[key];
};

/**
 * Flushes GET parameters
 */
const flushGet = () => {
    if (typeof FW !== "undefined") {
        FW.GET = {};
    }
};

/**
 * Gets the current mode
 * @returns {string} Current mode
 */
const getMode = () => getFWProperty('mode', 'offline');

// Export functions
module.exports.getPrefix = getPrefix;
module.exports.getSettings = getSettings;
module.exports.getRealm = getRealm;
module.exports.getLocale = getLocale;
module.exports.getPath = getPath;
module.exports.getHostname = getHostname;
module.exports.getCurrency = getCurrency;
module.exports.getContext = getContext;
module.exports.setContext = setContext;
module.exports.getToken = getToken;
module.exports.getTokenExp = getTokenExp;
module.exports.setToken = setToken;
module.exports.getRegistry = getRegistry;
module.exports.getUrl = getUrl;
module.exports.getSiteStatic = getSiteStatic;
module.exports.getCallUrlPrefix = getCallUrlPrefix;
module.exports.getUuid = getUuid;
module.exports.getInitialState = getInitialState;
module.exports.supported = supported;
module.exports.GET = getGET;
module.exports.Get = getParam;
module.exports.flushGet = flushGet;
module.exports.getMode = getMode;
