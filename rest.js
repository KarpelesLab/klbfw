'use strict'

const internal = require('./internal');

module.exports.rest = (name, verb, params, context) => {
    if (typeof __platformRest !== "undefined") {
      // direct SSR-mode call to rest api
      return new Promise(function(resolve, reject) {
        __platformRest(name, verb, params, function(res, err) {
          if (err) reject(err);
          if (res.result != "success") reject(res);
          resolve(res);
        });
      });
    }

    if(!internal.checkSupport()) return;

    return new Promise(function(resolve, reject) {
        var restResolved = function(data) {
            internal.responseParse(data, resolve, reject);
        }

        var restRejected = function(data) {
            reject(data);
        }

        var restCatch = function(data) {
            console.error(data);
            // TODO log errors
        }


        internal.internal_rest(name, verb, params, context)
            .then(restResolved, restRejected)
            .catch(restCatch)
    });
};

module.exports.rest_get = (name, params) => {
    if (typeof __platformRest !== "undefined") {
      // direct SSR-mode call to rest api
      return new Promise(function(resolve, reject) {
        __platformRest(name, "GET", params, function(res, err) {
          if (err) reject(err);
          if (res.result != "success") reject(res);
          resolve(res);
        });
      });
    }

    if(!internal.checkSupport()) return;

    params = params || {};
    var call_url = internal.rest_url(name, false);responseParse

    params = internal.parseUrlParams(params);
    if (params) call_url += "?" + params;

    var restResolved = function(data) {
        internal.responseParse(data, resolve, reject);
    }

    var restRejected = function(data) {
        reject(data);
    }

    var restCatch = function(data) {
        console.error(data);
        // TODO log errors
    }

    return new Promise(function(resolve, reject) {
        fetch(call_url, {
            method: 'GET',
            credentials: 'include'
        }).then(restResolved, restRejected).catch(restCatch);
    });
}
