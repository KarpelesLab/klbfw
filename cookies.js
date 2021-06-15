'use strict'
// vim: et:ts=4:sw=4

module.exports.getCookie = function(cname) {
    if (typeof FW !== "undefined") {
        return FW.cookies[cname];
    }

    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return undefined;
};

module.exports.setCookie = function(cname, value, exdays) {
    if (typeof FW !== "undefined") {
        // always override value
        FW.cookies[cname] = value;
    }

    var d = undefined;
    if (exdays > 0) {
        d = new Date();
        d.setTime(d.getTime() + (exdays*24*60*60*1000));
    }
    if (typeof __platformSetCookie !== "undefined") {
        // ssr mode
        return __platformSetCookie(cname, value, d);
    }
    if (typeof value === "undefined") {
        // remove cookie
        document.cookie = cname+"=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
        return;
    }

    var expires;
    if (d) {
        expires = "expires="+ d.toUTCString();
    }
    document.cookie = cname + "=" + value + ";" + expires + ";path=/;secure;samesite=none";
};
