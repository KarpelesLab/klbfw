'use strict';
const internalFW = require('./fw-wrapper');

function getI18N(language) {
    language = language || internalFW.getLocale();

    if (typeof __platformAsyncI18N !== "undefined") {
        // new SSR mode
        return __platformAsyncI18N(language);
    }
    if (typeof __platformGetI18N !== "undefined") {
        // we are in SSR mode
        return new Promise(function (resolve, reject) {
            resolve(__platformGetI18N(language));
        });
    }

    // use fetch()
    // /_special/locale/en-US.json
    return new Promise(function (resolve, reject) {
        // a simple GET is straightforward
        fetch("/_special/locale/" + language + ".json")
            .then(function (res) {
                if (!res.ok) {
                    reject({
                        message: `HTTP Error: ${res.status} ${res.statusText}`,
                        status: res.status
                    });
                    return;
                }
                res.json().then(resolve, reject).catch(function(error) {
                    reject(error || new Error('Failed to parse JSON response'));
                });
            }, reject)
            .catch(function(error) {
                reject(error || new Error('Failed to fetch locale data'));
            });
    });
}

function trimPrefix(url) {
    let currentPrefix = '';
    let currentText = '';
    const prefix = {};

    for (let i = 0; i < url.length; i++) {
        const currentChar = url[i];
        if (currentChar === '/' && !currentText) continue;

        if (!currentPrefix && currentText.length > 1) { // We are past the prefix
            currentText = currentText + url.substr(i);
            break;
        }

        if (currentChar === '/' && currentText) {
            if (currentText.length === 1) {
                currentPrefix = currentText;
                currentText = '';
                continue;
            } else {
                prefix[currentPrefix] = currentText;
                currentPrefix = '';
                currentText = '';
                continue;
            }
        }

        currentText += currentChar
    }

    return [prefix, '/' + currentText]
}


module.exports.getI18N = getI18N;
module.exports.trimPrefix = trimPrefix;
