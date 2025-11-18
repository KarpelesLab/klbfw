'use strict';
/**
 * @fileoverview Main entry point for KLB Frontend Framework
 * 
 * This module exports all public API functions from the framework's
 * individual modules.
 */

const internalFW = require('./fw-wrapper');
const rest = require('./rest');
const upload = require('./upload');
const util = require('./util');
const cookies = require('./cookies');

// Framework wrapper exports
module.exports.GET = internalFW.GET; // Use the function directly
module.exports.Get = internalFW.Get;
module.exports.flushGet = internalFW.flushGet;
module.exports.getPrefix = internalFW.getPrefix;
module.exports.getSettings = internalFW.getSettings;
module.exports.getRealm = internalFW.getRealm;
module.exports.getContext = internalFW.getContext;
module.exports.setContext = internalFW.setContext;
module.exports.getMode = internalFW.getMode;
module.exports.getHostname = internalFW.getHostname;
module.exports.getRegistry = internalFW.getRegistry;
module.exports.getLocale = internalFW.getLocale;
module.exports.getUserGroup = internalFW.getUserGroup;
module.exports.getCurrency = internalFW.getCurrency;
module.exports.getToken = internalFW.getToken;
module.exports.getUrl = internalFW.getUrl;
module.exports.getPath = internalFW.getPath;
module.exports.getUuid = internalFW.getUuid;
module.exports.getInitialState = internalFW.getInitialState;

// Cookie handling exports
module.exports.getCookie = cookies.getCookie;
module.exports.hasCookie = cookies.hasCookie;
module.exports.setCookie = cookies.setCookie;

// REST API exports
module.exports.rest = rest.rest;
module.exports.rest_get = rest.rest_get; // Backward compatibility
module.exports.restGet = rest.restGet;   // New camelCase name
module.exports.restSSE = rest.restSSE;

// Upload module exports
module.exports.upload = upload.upload;

// Utility exports
module.exports.getI18N = util.getI18N;
module.exports.trimPrefix = util.trimPrefix;