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
    var call_url = rest_url(name, false);responseParse

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

module.exports.upload = (function() {
    var upload          = {};
    var upload_queue    = []; // queue of uploads to run
    var upload_failed   = []; // failed upload(s)
    var upload_running  = {}; // currently processing uploads
    var up_id           = 0; // next upload id
    var last_input      = null;
    var sha256 = require('js-sha256').sha256;

    function sendprogress() {
        if (upload.onprogress == undefined) return;

        upload.onprogress(upload.getStatus());
    }

    function pad(number) {
        if (number < 10) {
            return '0' + number;
        }
        return number;
    }

    // retunr time in amz format, eg 20180930T132108Z
    function getAmzTime() {
        var t = new Date();
        return t.getUTCFullYear() +
            '' + pad(t.getUTCMonth() + 1) +
            pad(t.getUTCDate()) +
            'T' + pad(t.getUTCHours()) +
            pad(t.getUTCMinutes()) +
            pad(t.getUTCSeconds()) +
            'Z';
    }


    // perform call against AWS S3 with the appropriate signature obtained from server
    function awsReq(upInfo, method, query, body, headers, context) {
        headers 		= headers || {};
        context = context || {};

        if (body == "") {
            var bodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // sha256('')
        } else {
            var bodyHash = sha256(body);
        }

        var ts = getAmzTime(); // aws format, eg 20180930T132108Z
        var ts_d = ts.substring(0, 8);

        headers["X-Amz-Content-Sha256"] = bodyHash;
        headers["X-Amz-Date"] = ts;

        // prepare auth string
        var aws_auth_str = [
            "AWS4-HMAC-SHA256",
            ts,
            ts_d + "/"+upInfo.Bucket_Endpoint.Region+"/s3/aws4_request",
            method,
            "/"+upInfo.Bucket_Endpoint.Name+"/"+upInfo.Key,
            query,
            "host:"+upInfo.Bucket_Endpoint.Host,
        ];

        // list headers to sign (host and anything starting with x-)
        var sign_head = ['host'];
        var k = Object.keys(headers).sort();
        for(var i = 0; i < k.length; i++) {
            var s = k[i].toLowerCase();
            if (s.substring(0, 2) != "x-") {
                continue;
            }
            sign_head.push(s);
            aws_auth_str.push(s+":"+headers[k[i]]);
        }
        aws_auth_str.push("");
        aws_auth_str.push(sign_head.join(";"));
        aws_auth_str.push(bodyHash);

        var promise = new Promise(function(resolve, reject){

        	rest("Cloud/Aws/Bucket/Upload/"+upInfo.Cloud_Aws_Bucket_Upload__+":signV4", "POST", {headers: aws_auth_str.join("\n")}, context)
				.then(function(ares) {
                    var u = "https://"+upInfo.Bucket_Endpoint.Host+"/"+upInfo.Bucket_Endpoint.Name+"/"+upInfo.Key;
                    if (query != "") u = u + "?" + query;

                    headers["Authorization"] = ares.data.authorization;

                    // compute content type, if any
                    var ct = false;
                    if (headers["Content-Type"] != undefined) {
                        ct = headers["Content-Type"];
                        delete headers["Content-Type"];
                    }

                    window.fetch(u, {
                        method: method,
                        body : body,
                        headers: headers
                    })
					.then(resolve, reject)
					.catch(reject);


				}, reject)
				.catch(reject);

		})

		return promise;
    }


    function do_process_pending(up) {
        up["status"] = "pending-wip";
        // up is an object with api path, file, dfd
        var params = up.params;

        // set params for upload
        params["filename"] = up.file.name;
        params["size"] = up.file.size;
        params["lastModified"] = up.file.lastModified/1000;
        params["type"] = up.file.type;

        rest(up.path, "POST", params, up.context).then(function(res) {
            if (!res["data"]["Cloud_Aws_Bucket_Upload__"]) {
                // invalid data
                up.reject();
                delete upload_running[up.up_id];
                upload_failed.push(up);
                return;
            }

            up.info = res["data"]; // contains stuff like Bucket_Endpoint, Key, etc

            // ok we are ready to upload - this will initiate an upload
            awsReq(up.info, "POST", "uploads=", "", {"Content-Type": up.file.type,"X-Amz-Acl":"private"}, up.context)
				.then(response => response.text())
                .then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
                .then(dom => dom.querySelector('UploadId').innerHTML)
				.then(function (uploadId) {
                    up.uploadId = uploadId;

                    // ok, let's compute block size so we know how many parts we need to send
                    var fsize = up.file.size;
                    var bsize = Math.ceil(fsize / 10000); // we want ~10k parts
                    if (bsize < 5242880) bsize = 5242880; // minimum block size = 5MB

                    up.bsize = bsize;
                    up.blocks = Math.ceil(fsize / bsize);
                    up.b = {};
                    up['status'] = 'uploading';
                    upload.run();
                }).catch(res => failure(up, res))
        })
			.catch(res => failure(up, res));
    }


    function failure(up, data){
        if(!(up.up_id in upload_running)) return;

        for(var i = 0, len = upload_failed.length; i < len; i++) {
            if (upload_failed[i].up_id === up.up_id) {
                //already in
                return;
            }
        }

        up.failure = data;
        upload_failed.push(up);
        delete upload_running[up.up_id];
        upload.run();
        sendprogress();
        setTimeout(function() {
            var evt = new CustomEvent("upload:failed", {
                detail: {
                    item: up,
                    res : data
                }
            });
            document.dispatchEvent(evt);
        }, 10);
    }


    function do_upload_part(up, partno) {
        // ok, need to start this!
        up.b[partno] = "pending";
        var start = partno*up.bsize;
        var part = up.file.slice(start, start+up.bsize);

        var reader = new FileReader();
        reader.addEventListener("loadend", function() {
            awsReq(up.info, "PUT", "partNumber="+(partno+1)+"&uploadId="+up.uploadId, reader.result, null, up.context)
				.then(function(response){
                    up.b[partno] = response.headers.get("ETag");
                    sendprogress();
                    upload.run();
				}).catch(res => failure(up, res));
        });

        reader.addEventListener("error", function(e) {
            failure(up, e);
        });

        reader.readAsArrayBuffer(part);
    }


    function do_process_uploading(up) {
        if (up.paused || up.canceled) return;

        var p = 0; // pending
        var d = 0; // done
        for(var i = 0; i < up.blocks; i++) {
            if (up.b[i] == undefined) {
                if (up.paused) break; // do not start new parts if paused
                do_upload_part(up, i);
            } else if (up.b[i] != "pending") {
                d += 1;
                continue;
            }
            p += 1;
            if (p >= 3) break;
        }

        up["done"] = d;

        if (p == 0) {
            // complete, see https://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
            up["status"] = "validating";
            var xml = "<CompleteMultipartUpload>";
            for(var i = 0; i < up.blocks; i++) {
                xml += "<Part><PartNumber>"+(i+1)+"</PartNumber><ETag>"+up.b[i]+"</ETag></Part>";
            }
            xml += "</CompleteMultipartUpload>";
            awsReq(up.info, "POST", "uploadId="+up.uploadId, xml, null, up.context).then(function(r) {
                // if success, need to call finalize
                rest("Cloud/Aws/Bucket/Upload/"+up.info.Cloud_Aws_Bucket_Upload__+":handleComplete", "POST", {}, up.context).then(function(ares) {
                    // SUCCESS!
                    up["status"] = "complete";
                    up["final"] = ares["data"];
                    sendprogress();
                    up.resolve(up);
                    delete upload_running[up.up_id];
                    upload.run();
                });
            }).catch(res => failure(up,res));
        }
    }

    // take tasks from queue and run them if needed
    function fillqueue() {
        if (Object.keys(upload_running).length >= 3) return; // nothing yet
        // if (upload_failed.length > 0) return; // need to push "retry" to resume

        // max 3 uploading files
        while(Object.keys(upload_running).length < 3) {
            if (upload_queue.length == 0) return;
            var up = upload_queue.shift();
            upload_running[up.up_id] = up;
        }
        sendprogress();
    }


    upload.getStatus = function() {
        var prog = {
            "queue"     : upload_queue,
            "running"   : Object.keys(upload_running).map(function(e) {
                return upload_running[e]
            }) ,
            "failed"    : upload_failed,
        };

        return prog;
    }

    upload.resume = function() {
        // put failed stuff at end of queue, resume upload
        while(upload_failed.length > 0) {
            upload_queue.push(upload_failed.shift());
        }

        upload.run();
    };

    upload.init = function(path, params, notify) {
        // perform upload to a given API, for example Drive/Item/<id>:upload
        // will allow multiple files to be uploaded
        params = params || {};

        if (last_input != null) {
            last_input.parentNode.removeChild(last_input);
            last_input = null;
        }

        var input = document.createElement("input");
        input.type="file";
        input.style.display = "none";
        if (!params["single"]) {
            input.multiple = "multiple";
        }

        document.getElementsByTagName('body')[0].appendChild(input);
        last_input = input;

		var promise = new Promise(function(resolve, reject){
            input.onchange = function() {
				if (this.files.length == 0) {
				   resolve();
				}

				var count = this.files.length;

				for(var i = 0; i < this.files.length; i++) {
					upload.append(path, this.files[i], params, window.FW.Context).then(function(obj) {
						count -= 1;
					   // Todo notify process
                        if(notify!== undefined) notify(obj);
						if (count == 0) resolve();
					});
				}
				upload.run();
			};
        })

        input.click();
        return promise;
    };



    upload.append = function(path, file, params, context) {
        var promise = new Promise(function(resolve, reject){
            params = params || {};
            context = context || FW.Context; // refer to https://git.atonline.com/templates/atonline_drive_2018/issues/58

			var ctx =  {...{}, ...context}
            upload_queue.push({path: path, file: file, resolve: resolve, reject: reject, "status":"pending", paused: false, up_id: up_id++, params: params, context: ctx});
		})

        return promise;
    }


    upload.cancelItem = function (up_id) {
        var itemKey = -1;
        for (var i in upload_running) {
            if (upload_running[i].up_id == up_id) {
                itemKey = i;
                break;
            }
        }
        if (itemKey >= 0) {
            upload_running[itemKey].canceled = true;
        } else { // /!\ we should be able to cancel the upload of an item even if it's pending, so we're going to look at the queued items
            for (var i = 0; i < upload_queue.length; i++) {
                if (upload_queue[i].up_id == up_id) {
                    upload_queue[i].canceled = true;
                    break;
                }
            }
        }
        sendprogress();
    };

    // removes the canceled item of given ID from the queue or running list.
    upload.deleteItem = function (up_id) {
        var itemKey = -1;
        for (var i in upload_running) {
            if (upload_running[i].up_id == up_id) {
                itemKey = i;
                break;
            }
        }
        if (itemKey >= 0) {
            if (upload_running[itemKey].canceled)
                delete upload_running[itemKey];
        } else { // /!\ we should be able to cancel the upload of an item even if it's pending, so we're going to look at the queued items
            for (var i = 0; i < upload_queue.length; i++) {
                if (upload_queue[i].up_id == up_id) {
                    upload_queue.splice(i, 1);
                    break;
                }
            }

            for (var i = 0; i < upload_failed.length; i++) {
                if (upload_failed[i].up_id == up_id) {
                    upload_failed.splice(i, 1);
                    break;
                }
            }
        }
        sendprogress();
    }


    // changes the status of the item of given ID to "pause" so it stops triggering "do_process_uploading"
    upload.pauseItem = function (up_id) {
        var itemKey = -1;
        for (var i in upload_running) {
            if (upload_running[i].up_id == up_id) {
                itemKey = i;
                break;
            }
        }
        if (itemKey >= 0 && upload_running[itemKey].status == "uploading") // if the item we're willing to pause exists in the running list and is currently uploading
            upload_running[itemKey].paused = true;

        sendprogress();
    };


    // changes the status of the item of given ID to "uploading" and triggers "do_process_uploading" on it
    upload.resumeItem = function(up_id) {
        var itemKey = -1;
        for (var i in upload_running) {
            if (upload_running[i].up_id == up_id) {
                itemKey = i;
                break;
            }
        }
        if (itemKey >= 0 && upload_running[itemKey].paused) { // if the item we're willing to resume exists in the running list and is currently paused
            upload_running[itemKey].paused = false;
            do_process_uploading(upload_running[itemKey]);
        }
        sendprogress();
    };


    upload.retryItem = function(up_id){
        var itemKey = -1;
        var up = undefined;
        for (var i in upload_failed) {
            if (upload_failed[i].up_id == up_id) {
                itemKey = i;
                up = upload_failed[i];
                break;
            }
        }
        if (itemKey >= 0) {
            up.failure = {};
            for(var i = 0, len = upload_queue.length; i < len; i++) {
                if (upload_queue[i].up_id === up.up_id) {
                    //already in queue what ?
                    return;
                }
            }

            //reset pending partNumbers
            for(var i = 0; i < up.blocks; i++) {
                if(up.b[i] == "pending"){up.b[i] = undefined}
            }


            upload_failed.splice(itemKey, 1);
            upload_queue.push(up);

            upload.run();
            setTimeout(function() {
                var evt = new CustomEvent("upload:retry", {
                    detail: {
                        item: up,
                    }
                });
                document.dispatchEvent(evt);
            }, 10);


        }
        sendprogress();
    };


    // perform an upload following a response to upload a file from an API.
    //
    // TODO: if file is small enough, we can skip the multipart upload and just perform a straight PUT (will fail over 5GB, but we probably want a smaller cutoff, like 32MB or less)
    upload.run = function() {
        fillqueue();

        // check for elements in "q", start uploads we can start
        for(var up_id in upload_running) {
            var up = upload_running[up_id];
            switch (up['status']) {
                case "pending":
                    do_process_pending(up);
                    break;
                case "uploading":
                    do_process_uploading(up);
                    break;
            }
        }
    };

    return upload;
}());