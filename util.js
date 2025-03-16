'use strict';
/**
 * @fileoverview Utility functions for KLB Frontend Framework
 * 
 * This module provides utility functions for internationalization
 * and URL prefix handling.
 */

const internalFW = require('./fw-wrapper');

/**
 * Fetches internationalization data for the specified language
 * @param {string} language - Language code (e.g., 'en-US')
 * @returns {Promise<Object>} Promise resolving to internationalization data
 */
const getI18N = (language) => {
    // Use language from parameters or get from framework
    language = language || internalFW.getLocale();

    // Handle platform-specific i18n implementations
    if (typeof __platformAsyncI18N !== "undefined") {
        // New SSR mode
        return __platformAsyncI18N(language);
    }
    
    if (typeof __platformGetI18N !== "undefined") {
        // Legacy SSR mode
        return Promise.resolve(__platformGetI18N(language));
    }

    // Use fetch in browser environment
    return new Promise((resolve, reject) => {
        fetch("/_special/locale/" + language + ".json")
            .then(res => {
                if (!res.ok) {
                    reject({
                        message: `HTTP Error: ${res.status} ${res.statusText}`,
                        status: res.status
                    });
                    return;
                }
                
                res.json()
                    .then(resolve)
                    .catch(error => {
                        reject(error || new Error('Failed to parse JSON response'));
                    });
            })
            .catch(error => {
                reject(error || new Error('Failed to fetch locale data'));
            });
    });
};

/**
 * Extracts prefixes from a URL path
 * @param {string} url - URL path to process
 * @returns {Array} Array containing [prefixObject, remainingPath]
 */
const trimPrefix = (url) => {
    let currentPrefix = '';
    let currentText = '';
    const prefix = {};

    for (let i = 0; i < url.length; i++) {
        const currentChar = url[i];
        
        // Skip consecutive slashes
        if (currentChar === '/' && !currentText) continue;

        // If we have text and not in a prefix, we're done with prefixes
        if (!currentPrefix && currentText.length > 1) {
            currentText = currentText + url.substr(i);
            break;
        }

        // Handle slash after text
        if (currentChar === '/' && currentText) {
            if (currentText.length === 1) {
                // This is a prefix indicator (e.g., /l/ for language)
                currentPrefix = currentText;
                currentText = '';
                continue;
            } else {
                // This is a prefix value (e.g., /l/en-US/)
                prefix[currentPrefix] = currentText;
                currentPrefix = '';
                currentText = '';
                continue;
            }
        }

        // Add character to current text
        currentText += currentChar;
    }

    return [prefix, '/' + currentText];
};

// Export functions
module.exports.getI18N = getI18N;
module.exports.trimPrefix = trimPrefix;