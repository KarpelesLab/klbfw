'use strict';
const internalFW = require('./fw-wrapper');
const rest = require('./rest');
const upload = require('./upload');
const util = require('./util');
const cookies = require('./cookies');

module.exports.GET = internalFW.GET;
module.exports.Get = internalFW.Get;
module.exports.flushGet = internalFW.flushGet;
module.exports.getPrefix = internalFW.getPrefix;
module.exports.getSettings = internalFW.getSettings;
module.exports.getRealm = internalFW.getRealm;
module.exports.getContext = internalFW.getContext;
module.exports.setContext = internalFW.setContext;
module.exports.getMode = internalFW.getMode;
module.exports.getHostname = internalFW.getHostname;
module.exports.getLocale = internalFW.getLocale;
module.exports.getUserGroup = internalFW.getUserGroup;
module.exports.getCurrency = internalFW.getCurrency;
module.exports.getToken = internalFW.getToken;
module.exports.getUrl = internalFW.getUrl;
module.exports.getPath = internalFW.getPath;
module.exports.getUuid = internalFW.getUuid;
module.exports.getInitialState = internalFW.getInitialState;
module.exports.getCookie = cookies.getCookie;
module.exports.hasCookie = cookies.hasCookie;
module.exports.setCookie = cookies.setCookie;

module.exports.rest = rest.rest;
module.exports.rest_get = rest.rest_get;

module.exports.upload = upload.upload;

module.exports.getI18N = util.getI18N;
module.exports.trimPrefix = util.trimPrefix;
