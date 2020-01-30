'use strict';
const fwWrapper = require('./fw-wrapper');

function get_tz_pad(number, length) {
    var str = "" + number;
    while (str.length < length)
        str = '0' + str;
    return str;
}

function get_timezone_data() {
    // grab current offset value & built string
    var offset = new Date().getTimezoneOffset();
    offset = ((offset < 0 ? '+' : '-') + // Note the reversed sign!
        get_tz_pad(parseInt(Math.abs(offset / 60)), 2) +
        get_tz_pad(Math.abs(offset % 60), 2));

    // check if we have intl info

    if (typeof Intl != 'undefined' && (Intl.DateTimeFormat != undefined)) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone + ";" + offset;
    }

    return offset;
}

function rest_url(path, with_token, context) {
    if (!with_token) {
        if (fwWrapper.getCallUrlPrefix()) return fwWrapper.getCallUrlPrefix() + "/_special/rest/" + path;
        return "/_special/rest/" + path;
    }
    context = context || {};

    if (fwWrapper.getSiteStatic()) {
        var call_url = "/_special/rest/" + path + "?static";
    } else {
        var call_url = "/_special/rest/" + path + "?_csrf_token=" + fwWrapper.getToken();
    }
    if (fwWrapper.getCallUrlPrefix()) call_url = fwWrapper.getCallUrlPrefix() + call_url;

    // copy context, proceed with overload then add to url
    var ctx_final = fwWrapper.getContext();
    for (var i in context) ctx_final[i] = context[i];
    for (var i in ctx_final) {
        if (i == "_") continue;
        call_url = call_url + "&_ctx[" + i + "]=" + encodeURIComponent(fwWrapper.getContext()[i]);
    }
    return call_url;
}

function parseUrlParams(urlParams) {
    return http_build_query(urlParams, '', '&');
}

function urlencode (str) {
    // https://locutus.io/php/url/urlencode/
    str = (str + '')

    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A')
        .replace(/~/g, '%7E')
        .replace(/%20/g, '+')
}

function http_build_query(formdata, numericPrefix, argSeparator) {
   // https://locutus.io/php/url/http_build_query/
    var value;
    var key;
    var tmp = [];

    var _httpBuildQueryHelper = function (key, val, argSeparator) {
        var k;
        var tmp = [];
        if (val === true) {
            val = '1'
        } else if (val === false) {
            val = '0'
        }
        if (val !== null) {
            if (typeof val === 'object') {
                for (k in val) {
                    if (val[k] !== null) {
                        tmp.push(_httpBuildQueryHelper(key + '[' + k + ']', val[k], argSeparator))
                    }
                }
                return tmp.join(argSeparator)
            } else if (typeof val !== 'function') {
                return urlencode(key) + '=' + urlencode(val)
            } else {
                throw new Error('There was an error processing for http_build_query().')
            }
        } else {
            return ''
        }
    };

    if (!argSeparator) {
        argSeparator = '&'
    }
    for (key in formdata) {
        value = formdata[key];
        if (numericPrefix && !isNaN(key)) {
            key = String(numericPrefix) + key
        }
        var query = _httpBuildQueryHelper(key, value, argSeparator);
        if (query !== '') {
            tmp.push(query)
        }
    }

    return tmp.join(argSeparator)
}


function internal_rest(name, verb, params, context) {
    verb = verb || "GET";
    params = params || {};
    context = context || {};

    if (typeof window !== "undefined") {
        context['t'] = get_timezone_data();
    }
    var call_url = rest_url(name, true, context);

    if (verb == "GET") {
        params = parseUrlParams(params);
        if (params) call_url += "&" + params;

        return fetch(call_url, {method: verb, credentials: 'include'});
    }

    if ((FormData != undefined) && (params instanceof FormData)) {
        return fetch(call_url, {
            method: verb,
            credentials: 'include',
            body: params
        });
    }

    return fetch(call_url, {
        method: verb,
        credentials: 'include',
        body: JSON.stringify(params),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

function checkSupport() {
    var ok = true;
    if (!fetch) {
        console.error("Fetch unsupported");
        ok = false;
    }

    if (!fwWrapper.supported()) {
        console.error("FW not found");
        ok = false;
    }

    return ok;
}

function responseParse(response, resolve, reject) {
    var contentType = response.headers.get("content-type");
    if (!contentType || contentType.indexOf("application/json") == -1) {
        response.text().then(
            function (text) {
                reject({message: "Not JSON", body: text});
            },
            reject
        ).catch(reject);

        return;
    }

    response.json().then(
        function (json) {
            if (json.result != "success") reject(json);
            resolve(json);
        },
        reject
    ).catch(reject)
}

module.exports.get_tz_pad = get_tz_pad;

module.exports.get_timezone_data = get_timezone_data;

module.exports.rest_url = rest_url;

module.exports.parseUrlParams = parseUrlParams;

module.exports.internal_rest = internal_rest;

module.exports.checkSupport = checkSupport;

module.exports.responseParse = responseParse;
