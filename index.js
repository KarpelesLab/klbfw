'use strict'

function get_tz_pad(number, length) {
	var str = "" + number
	while (str.length < length)
		str = '0'+str;
	return str;
};

 
 function get_timezone_data() {
	// grab current offset value & built string
	var offset = new Date().getTimezoneOffset();
	offset = ((offset<0? '+':'-')+ // Note the reversed sign!
		get_tz_pad(parseInt(Math.abs(offset/60)), 2)+
		get_tz_pad(Math.abs(offset%60), 2));

	// check if we have intl info
	if ((Intl != undefined) && (Intl.DateTimeFormat != undefined)) {
		return Intl.DateTimeFormat().resolvedOptions().timeZone+";"+offset;
	}

	return offset;
};


function rest_url(path, with_token, context) {
	if (!with_token) {
		if (window.FW.api_prefix) return window.FW.api_prefix + "/_special/rest/"+path;
		return "/_special/rest/"+path;
	}
	context = context || {};

	if (window.FW.site_static) {
		if (window.FW.api_prefix) {
			var call_url = window.FW.api_prefix + "/_special/rest/"+path+"?static";
		} else {
			var call_url = "/_special/rest/"+path+"?static";
		}
	} else {
		var call_url = "/_special/rest/"+path+"?_csrf_token="+window.FW.token;
	}
	if (window.FW.call_url_prefix) call_url = window.FW.call_url_prefix + call_url;

	// copy context, proceed with overload then add to url
	var ctx_final = window.FW.Context;
	for(var i in context) ctx_final[i] = context[i];
	for(var i in ctx_final) {
		if (i == "_") continue;
		call_url = call_url + "&_ctx["+i+"]="+encodeURIComponent(window.FW.Context[i]);
	}
	return call_url;
}


function parseUrlParams(urlParams) {
	if(!urlParams) return '';
    const joinByEquals = (pair) => pair.join('=')
    const params = Object.entries(urlParams).map(joinByEquals).join('&')
    if (params) {
        return `${params}`
    } else {
        return ''
    }
}

function internal_rest(name, verb, params, context){
	verb = verb || "GET";
	params = params || {};
	context = context || {};
	context['t'] = get_timezone_data();
	var call_url = rest_url(name, true, context);

    if (verb == "GET") {
        params = parseUrlParams(params);
        if (params) call_url += "&" + params;

        return window.fetch(call_url, { method: verb,credentials: 'include'});
    }

    if ((FormData != undefined) && (params instanceof FormData)) {
        return window.fetch(call_url, {
        	method: verb,
			credentials: 'include',
			body : params
        });
    }

    return window.fetch(call_url, {
        method: verb,
        credentials: 'include',
        body : JSON.stringify(params),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

function checkSupport() {
	var ok = true;
	if(!window.fetch) {
		console.error("Fetch unsupported");
		ok= false;
	}
	
	if(!window.FW) {
		console.error("FW not found");
		ok= false;
	}
	
	return ok;
}


function responseParse(response, resolve, reject) {
    var contentType = response.headers.get("content-type");
    if(!contentType || contentType.indexOf("application/json") == -1) {		
		response.text().then(
			function(text)
			{
				reject({message:"Not JSON", body : text});
			},
			reject
		).catch(reject)
		
    	return;
	}

	response.json().then(
		function(json)
		{
			if(json.result != "success") reject(json);
			resolve(json);
		},
		reject
	).catch(reject)
}

function rest(name, verb, params, context) {
    if(!checkSupport()) return;

    return new Promise(function(resolve, reject) {
    	var restResolved = function(data) {
            responseParse(data, resolve, reject);
		}

		var restRejected = function(data) {
            reject(data);
		}

        var restCatch = function(data) {
            console.error(data);
            // TODO log errors
        }


        internal_rest(name, verb, params, context)
			.then(restResolved, restRejected)
			.catch(restCatch)
	});
};

function rest_get(name, params) {
	 if(!checkSupport()) return;
	
    params = params || {};
    var call_url = FW.rest_url(name, false);responseParse

    params = parseUrlParams(params);
    if (params) call_url += "?" + params;

    var restResolved = function(data) {
        responseParse(data, resolve, reject);
    }

    var restRejected = function(data) {
        reject(data);
    }

    var restCatch = function(data) {
        console.error(data);
        // TODO log errors
    }

    return new Promise(function(resolve, reject) {
        window.fetch(call_url, {
            method: 'GET',
            credentials: 'include'
        }).then(restResolved, restRejected).catch(restCatch);
    });
}

module.exports.rest = rest;
module.exports.rest_get = rest_get;