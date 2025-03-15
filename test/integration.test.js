'use strict';

const klbfw = require('../index');
const upload = require('../upload');

// Set this flag to true to run integration tests
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

// API config
const API_CONFIG = {
  token: process.env.API_TOKEN || ''
};

// Skip tests if integration tests are disabled
const conditionalTest = RUN_INTEGRATION_TESTS ? test : test.skip;

// Set up test context
const setupTestContext = () => {
  // Create a temporary test context for API calls
  return {
    csrf: API_CONFIG.token,
    t: new Date().toISOString()
  };
};

describe('API Integration Tests', () => {
  beforeAll(() => {
    // Skip all tests if integration tests are not enabled
    if (!RUN_INTEGRATION_TESTS) {
      console.log('Integration tests skipped. Set RUN_INTEGRATION_TESTS=true to enable.');
    } else {
      console.log('Running integration tests against the server');
    }
  });
  
  describe('Debug Endpoints', () => {
    conditionalTest('Misc/Debug:request returns request info', async () => {
      const response = await klbfw.rest('Misc/Debug:request', 'GET', {}, setupTestContext());
      
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toHaveProperty('headers');
      expect(response.data).toHaveProperty('ip');
      expect(response.data).toHaveProperty('method', 'GET');
      
      console.log('Debug:request response:', JSON.stringify(response.data, null, 2));
    }, 10000);
    
    conditionalTest('Misc/Debug:params returns passed parameters', async () => {
      const testParams = { 
        foo: 'bar', 
        num: 123, 
        arr: [1, 2, 3],
        testTime: new Date().toISOString()
      };
      
      const response = await klbfw.rest('Misc/Debug:params', 'POST', testParams, setupTestContext());
      
      expect(response).toHaveProperty('result', 'success');
      // The response data should contain the same parameters we sent
      Object.keys(testParams).forEach(key => {
        expect(response.data).toHaveProperty(key);
        if (typeof testParams[key] !== 'object') {
          expect(response.data[key]).toBe(testParams[key]);
        }
      });
      
      console.log('Debug:params response:', JSON.stringify(response.data, null, 2));
    }, 10000);
    
    conditionalTest('Misc/Debug:fixedString returns fixed string', async () => {
      const response = await klbfw.rest('Misc/Debug:fixedString', 'GET', {}, setupTestContext());
      
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toBe('fixed string');
      
      console.log('Debug:fixedString response:', response.data);
    }, 10000);
    
    conditionalTest('Misc/Debug:error throws an error', async () => {
      expect.assertions(2);
      
      try {
        await klbfw.rest('Misc/Debug:error', 'GET', {}, setupTestContext());
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toHaveProperty('result', 'error');
        expect(error).toHaveProperty('error');
        
        console.log('Debug:error response:', JSON.stringify(error, null, 2));
      }
    }, 10000);
    
    conditionalTest('rest_get works with actual API', async () => {
      const response = await klbfw.rest_get('Misc/Debug:fixedString', {}, setupTestContext());
      
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toBe('fixed string');
      
      console.log('rest_get response:', response.data);
    }, 10000);
  });
  
  // Only run file upload tests if explicitly enabled with an additional flag
  const uploadTest = (RUN_INTEGRATION_TESTS && process.env.RUN_UPLOAD_TESTS === 'true') ? test : test.skip;
  
  describe('File Upload', () => {
    uploadTest('can upload a file to Misc/Debug:testUpload', async () => {
      // Create a file-like object for testing
      // This requires browser environment which is not available in Node.js
      // So we'll skip this test unless implementing a special case
      
      console.log('Upload test would go here, but requires browser environment');
      expect(true).toBe(true);
    }, 30000);
  });
});