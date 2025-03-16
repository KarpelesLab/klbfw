'use strict';

// Mock fetch for Node environment
global.fetch = require('node-fetch');

// Mock browser APIs that might not exist in test environment
global.FormData = global.FormData || class FormData {};

// Create FW global object - this is always present in both browser and SSR
global.FW = {
  Context: {
    b: "master",
    c: "USD",
    l: "en-US",
    g: "default"
  },
  GET: {},
  Locale: "en-US",
  Realm: {
    Domain: "example.com",
    Name: "example.com"
  },
  Registry: {
    Currency_List: "USD",
    Language__: "en-US",
    System_Timezone: "UTC"
  },
  URL: {
    full: "https://example.com/l/en-US/",
    host: "example.com",
    path: "/l/en-US/",
    scheme: "https"
  },
  cookies: {
    Locale: "en-US"
  },
  hostname: "example.com",
  mode: "client", // default to client mode
  path: "/",
  prefix: "/l/en-US",
  token: "test-csrf-token",
  uuid: "00000000-0000-0000-0000-000000000000"
};

// Setup test modes
const setupSSRMode = () => {
  // Configure SSR mode
  FW.mode = "ssr";
  
  // Add platform functions for SSR
  global.__platformAsyncRest = jest.fn().mockImplementation((name, verb, params, context) => {
    return Promise.resolve({
      result: 'success',
      data: { mock: 'data' }
    });
  });
  
  global.__platformRest = jest.fn().mockImplementation((name, verb, params, context) => {
    return { 
      result: 'success',
      data: { mock: 'data' }
    };
  });
  
  global.__platformSetCookie = jest.fn();
};

const setupClientMode = () => {
  // Configure client mode
  FW.mode = "client";
  
  // Remove platform functions
  if (global.__platformAsyncRest) delete global.__platformAsyncRest;
  if (global.__platformRest) delete global.__platformRest;
  if (global.__platformSetCookie) delete global.__platformSetCookie;
};

// Helper to reset mocks between tests
const resetMocks = () => {
  if (global.__platformAsyncRest) {
    global.__platformAsyncRest.mockClear();
    // Set up custom implementation for debug endpoints
    global.__platformAsyncRest.mockImplementation((name, verb, params, context) => {
      switch(name) {
        case 'Misc/Debug:request':
          return Promise.resolve({
            result: 'success',
            data: {
              headers: { 'user-agent': 'Jest Test' },
              ip: '127.0.0.1',
              method: verb || 'GET',
              path: '/api/Misc/Debug:request'
            }
          });
        case 'Misc/Debug:params':
          return Promise.resolve({
            result: 'success',
            data: params || { empty: true }
          });
        case 'Misc/Debug:fixedString':
          return Promise.resolve({
            result: 'success',
            data: "fixed string"
          });
        case 'Misc/Debug:error':
          return Promise.reject({
            result: 'error',
            error: 'This is an error response',
            code: 'TEST_ERROR'
          });
        case 'Misc/Debug:testUpload':
          return Promise.resolve({
            result: 'success',
            data: {
              files: [
                {
                  name: params?.name || 'test-file.jpg',
                  size: params?.size || 12345,
                  type: params?.type || 'image/jpeg'
                }
              ]
            }
          });
        default:
          return Promise.resolve({
            result: 'success',
            data: { mock: 'data' }
          });
      }
    });
  }
  
  if (global.__platformRest) {
    global.__platformRest.mockClear();
    // Set up custom implementation for debug endpoints
    global.__platformRest.mockImplementation((name, verb, params, context) => {
      switch(name) {
        case 'Misc/Debug:request':
          return {
            result: 'success',
            data: {
              headers: { 'user-agent': 'Jest Test' },
              ip: '127.0.0.1',
              method: verb || 'GET',
              path: '/api/Misc/Debug:request'
            }
          };
        case 'Misc/Debug:params':
          return {
            result: 'success',
            data: params || { empty: true }
          };
        case 'Misc/Debug:fixedString':
          return {
            result: 'success',
            data: "fixed string"
          };
        case 'Misc/Debug:error':
          throw {
            result: 'error',
            error: 'This is an error response',
            code: 'TEST_ERROR'
          };
        case 'Misc/Debug:testUpload':
          return {
            result: 'success',
            data: {
              files: [
                {
                  name: params?.name || 'test-file.jpg',
                  size: params?.size || 12345,
                  type: params?.type || 'image/jpeg'
                }
              ]
            }
          };
        default:
          return {
            result: 'success',
            data: { mock: 'data' }
          };
      }
    });
  }
  
  if (global.__platformSetCookie) {
    global.__platformSetCookie.mockClear();
  }
  
  // Reset fetch mock with custom implementation for debug endpoints
  global.fetch = jest.fn().mockImplementation((url, options) => {
    // Extract endpoint from URL
    let endpoint = '';
    
    // Try to extract endpoint name from URL
    if (url.includes('Misc/Debug:request')) {
      endpoint = 'Misc/Debug:request';
    } else if (url.includes('Misc/Debug:params')) {
      endpoint = 'Misc/Debug:params';
    } else if (url.includes('Misc/Debug:fixedString')) {
      endpoint = 'Misc/Debug:fixedString';
    } else if (url.includes('Misc/Debug:error')) {
      endpoint = 'Misc/Debug:error';
    } else if (url.includes('Misc/Debug:testUpload')) {
      endpoint = 'Misc/Debug:testUpload';
    } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('signV4')) {
      // Special case for AWS signature
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (header) => header.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.resolve({
          result: 'success',
          data: {
            authorization: 'AWS4-HMAC-SHA256 test-auth'
          }
        }),
        text: () => Promise.resolve('')
      });
    } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('handleComplete')) {
      // Mock the handleComplete endpoint
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (header) => header.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.resolve({
          result: 'success',
          data: {
            Blob__: 'blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq',
            SHA256: '6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1',
            Size: '1075',
            Mime: 'application/octet-stream'
          }
        }),
        text: () => Promise.resolve('')
      });
    } else if (url.includes('example.com/upload')) {
      // For upload file PUT
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (header) => null
        }
      });
    }
    
    // For error endpoint, return error response
    if (endpoint === 'Misc/Debug:error') {
      return Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: {
          get: (header) => header.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: () => Promise.resolve({
          result: 'error',
          error: 'This is an error response',
          code: 'TEST_ERROR'
        })
      });
    }
    
    // Extract params from request body
    let params = {};
    if (options && options.body) {
      try {
        if (typeof options.body === 'string') {
          params = JSON.parse(options.body);
        } else if (options.body instanceof FormData) {
          params = { 
            name: 'test-file.jpg',
            size: 12345,
            type: 'image/jpeg',
            isFormData: true
          };
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Return response based on endpoint
    const responseData = (() => {
      switch(endpoint) {
        case 'Misc/Debug:request':
          return {
            result: 'success',
            data: {
              headers: { 'user-agent': 'Jest Test' },
              ip: '127.0.0.1',
              method: options?.method || 'GET',
              path: '/api/Misc/Debug:request'
            }
          };
        case 'Misc/Debug:params':
          return {
            result: 'success',
            data: params || { empty: true }
          };
        case 'Misc/Debug:fixedString':
          return {
            result: 'success',
            data: "fixed string"
          };
        case 'Misc/Debug:testUpload':
          return {
            result: 'success',
            data: {
              PUT: 'https://example.com/upload',
              Complete: 'Cloud/Aws/Bucket/Upload/clabu-acjhff-mhhj-cxzb-lawe-qphwpedu:handleComplete',
              Blocksize: 5242880,
              id: 'test-file-id',
              name: 'test.jpg',
              size: 12345,
              type: 'image/jpeg'
            }
          };
        default:
          return {
            result: 'success',
            data: { mock: 'data' }
          };
      }
    })();
    
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (header) => header.toLowerCase() === 'content-type' ? 'application/json' : null
      },
      json: () => Promise.resolve(responseData)
    });
  });
  
  // Reset cookies
  FW.cookies = {
    Locale: "en-US"
  };
  
  // Reset document.cookie if in browser environment
  if (typeof document !== 'undefined') {
    document.cookie = '';
  }
};

module.exports = {
  setupSSRMode,
  setupClientMode,
  resetMocks
};