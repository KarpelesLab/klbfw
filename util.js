'use strict';
const internalFW = require('./fw-wrapper');

function getI18N(language) {
	if (typeof __platformGetI18N !== "undefined") {
		// we are in SSR mode
		return new Promise(function(resolve, reject) {
			resolve(__platformGetI18N(language));
		});
	}

	// use fetch()
	// /_special/locale/en-US.json
	return new Promise(function(resolve, reject) {
		if (!language)
			language = internalFW.getLocale();

		// a simple GET is straightforward
		fetch("/_special/locale/"+language+".json")
		.then(function(res) {
			res.json().then(resolve, reject);
		}, reject);
	});
}

module.exports.getI18N = getI18N;
