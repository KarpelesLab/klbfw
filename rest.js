'use strict'
// vim: et:ts=4:sw=4

const internal = require('./internal');
const fwWrapper = require('./fw-wrapper');

module.exports.rest = (name, verb, params, context) => {
    if (typeof __platformAsyncRest !== "undefined") {
        context = context || {};
        var ctx_final = fwWrapper.getContext();
        for (var i in context) ctx_final[i] = context[i];
        var p1 = new Promise(function(resolve, reject) {
            __platformAsyncRest(name, verb, params, ctx_final).then(function(result) {
                if (result.result != "success" && result.result != "redirect") {
                    reject(result);
                } else {
                    resolve(result);
                }
            }, reject).catch(function(error) {
                reject(error || new Error('Unknown platform async error'));
            });
        });
        return p1;
    }
    if (typeof __platformRest !== "undefined") {
      // direct SSR-mode call to rest api
      return new Promise(function(resolve, reject) {
        __platformRest(name, verb, params, function(res, err) {
            if (err) {
                reject(err);
            } else if (res.result != "success") {
                reject(res);
            } else {
                resolve(res);
            }
        });
      });
    }

    if(!internal.checkSupport()) {
        return Promise.reject(new Error('Environment not supported'));
    }

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
    if (typeof __platformAsyncRest !== "undefined") {
        return new Promise(function(resolve, reject) {
            __platformAsyncRest(name, "GET", params).then(function(result) {
                if (result.result != "success" && result.result != "redirect") {
                    reject(result);
                } else {
                    resolve(result);
                }
            }, reject).catch(function(error) {
                reject(error || new Error('Unknown platform async error'));
            });
        });
    }
    if (typeof __platformRest !== "undefined") {
      // direct SSR-mode call to rest api
      return new Promise(function(resolve, reject) {
        __platformRest(name, "GET", params, function(res, err) {
            if (err) {
                reject(err);
            } else if (res.result != "success") {
                reject(res);
            } else {
                resolve(res);
            }
        });
      });
    }

    if(!internal.checkSupport()) {
        return Promise.reject(new Error('Environment not supported'));
    }

    params = params || {};
    var call_url = internal.rest_url(name, false);

    if (params) {
        // check if params is a json string, or if it needs encoding
        if (typeof params === "string") {
            call_url += "?_=" + encodeURIComponent(params);
        } else {
            call_url += "?_=" + encodeURIComponent(JSON.stringify(params));
        }
    }

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

        fetch(call_url, {
            method: 'GET',
            credentials: 'include'
        }).then(restResolved, restRejected).catch(restCatch);
    });
}
