'use strict';
/**
 * @fileoverview Cookie handling utilities for KLB Frontend Framework
 * 
 * This module provides functions for getting, setting, and checking cookies
 * in both browser and server-side rendering environments.
 */

/**
 * Parses cookies from document.cookie
 * @private
 * @returns {Object} Parsed cookies as key-value pairs
 */
const parseCookies = () => {
    if (typeof document === "undefined") {
        return {};
    }
    
    const cookies = {};
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieParts = decodedCookie.split(';');
    
    for (const part of cookieParts) {
        let cookiePart = part.trim();
        const equalsIndex = cookiePart.indexOf('=');
        
        if (equalsIndex > 0) {
            const name = cookiePart.substring(0, equalsIndex);
            const value = cookiePart.substring(equalsIndex + 1);
            cookies[name] = value;
        }
    }
    
    return cookies;
};

/**
 * Gets a cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|undefined} Cookie value or undefined if not found
 */
const getCookie = (name) => {
    // Check for framework cookie handling
    if (typeof FW !== "undefined") {
        return FW.cookies[name];
    }
    
    // Server-side rendering without framework
    if (typeof document === "undefined") {
        return undefined;
    }

    // Browser environment without framework
    const cookieName = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieParts = decodedCookie.split(';');
    
    for (const part of cookieParts) {
        let c = part.trim();
        if (c.indexOf(cookieName) === 0) {
            return c.substring(cookieName.length);
        }
    }
    
    return undefined;
};

/**
 * Checks if a cookie exists
 * @param {string} name - Cookie name
 * @returns {boolean} Whether the cookie exists
 */
const hasCookie = (name) => {
    // Check for framework cookie handling
    if (typeof FW !== "undefined") {
        return (FW.cookies.hasOwnProperty(name) && FW.cookies[name] !== undefined);
    }
    
    // Server-side rendering without framework
    if (typeof document === "undefined") {
        return false;
    }
    
    // Browser environment without framework
    return getCookie(name) !== undefined;
};

/**
 * Sets a cookie
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} exdays - Expiration days (0 or negative for session cookie)
 */
const setCookie = (name, value, exdays) => {
    // Check for framework cookie handling
    if (typeof FW !== "undefined") {
        // Always override value
        FW.cookies[name] = value;
    }

    // Calculate expiration if needed
    let d;
    if (exdays > 0) {
        d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    }
    
    // Server-side rendering
    if (typeof __platformSetCookie !== "undefined") {
        return __platformSetCookie(name, value, d);
    }
    
    // Server-side without cookie handling
    if (typeof document === "undefined") {
        return;
    }
    
    // Handle cookie deletion
    if (typeof value === "undefined") {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
        return;
    }

    // Set cookie in browser
    let expires = "";
    if (d) {
        expires = "expires=" + d.toUTCString();
    }
    
    document.cookie = name + "=" + value + ";" + expires + ";path=/;secure;samesite=none";
};

// Export functions
module.exports.getCookie = getCookie;
module.exports.hasCookie = hasCookie;
module.exports.setCookie = setCookie;