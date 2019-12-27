'use strict'
const internalFW = require('./fw-wrapper');
const rest = require('./rest');
const upload = require('./upload');

module.exports.getPrefix = internalFW.getPrefix;
module.exports.getLocale = internalFW.getLocale;
module.exports.getUser = internalFW.getUser;
module.exports.getUserGroup = internalFW.getUserGroup;
module.exports.getCurrency =  internalFW.getCurrency;
module.exports.getToken =  internalFW.getToken;
module.exports.getUrl = internalFW.getUrl;
module.exports.getPath = internalFW.getPath;

module.exports.rest = rest.rest;
module.exports.rest_get = rest.rest_get;

module.exports.upload = upload.upload;