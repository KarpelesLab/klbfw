'use strict';
const fwWrapper = require('./fw-wrapper');

// vim: et:ts=4:sw=4

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
        call_url = call_url + "&_ctx[" + i + "]=" + encodeURIComponent(ctx_final[i]);
    }
    return call_url;
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
        if (params) {
            // check if params is a json string, or if it needs encoding
            if (typeof params === "string") {
                call_url += "&_=" + encodeURIComponent(params);
            } else {
                call_url += "&_=" + encodeURIComponent(JSON.stringify(params));
            }
        }

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
            // check for gtag
            if ((json.gtag) && (typeof window !== "undefined") && (window.gtag)) {
                json.gtag.map((item) => window.gtag.apply(null, item));
            }
            // check for result
            if (json.result != "success" && json.result != "redirect") {
                reject(json);
            } else {
                resolve(json);
            }
        },
        reject
    ).catch(reject)
}

module.exports.get_tz_pad = get_tz_pad;

module.exports.get_timezone_data = get_timezone_data;

module.exports.rest_url = rest_url;

module.exports.internal_rest = internal_rest;

module.exports.checkSupport = checkSupport;

module.exports.responseParse = responseParse;
