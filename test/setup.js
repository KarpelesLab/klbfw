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
  }
  if (global.__platformRest) {
    global.__platformRest.mockClear();
  }
  if (global.__platformSetCookie) {
    global.__platformSetCookie.mockClear();
  }
  
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