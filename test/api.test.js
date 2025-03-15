'use strict';

const klbfw = require('../index');
const upload = require('../upload');
const { setupSSRMode, setupClientMode, resetMocks } = require('./setup');

describe('API Debug Endpoints', () => {
  beforeEach(() => {
    resetMocks();
  });
  
  describe('Client Mode', () => {
    beforeEach(() => {
      setupClientMode();
    });
    
    test('Misc/Debug:request returns request info', async () => {
      const response = await klbfw.rest('Misc/Debug:request', 'GET');
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toHaveProperty('ip', '127.0.0.1');
      expect(response.data).toHaveProperty('headers');
      expect(response.data).toHaveProperty('method', 'GET');
    });
    
    test('Misc/Debug:params returns passed parameters', async () => {
      const testParams = { foo: 'bar', num: 123, arr: [1, 2, 3] };
      const response = await klbfw.rest('Misc/Debug:params', 'POST', testParams);
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toEqual(testParams);
    });
    
    test('Misc/Debug:fixedString returns a fixed string', async () => {
      const response = await klbfw.rest('Misc/Debug:fixedString', 'GET');
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toBe('fixed string');
    });
    
    test('Misc/Debug:error throws an error', async () => {
      expect.assertions(1);
      try {
        await klbfw.rest('Misc/Debug:error', 'GET');
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        // Just verify an error was thrown
        expect(error).toBeDefined();
      }
    });
    
    test('rest_get works with debug endpoints', async () => {
      const response = await klbfw.rest_get('Misc/Debug:fixedString');
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toBe('fixed string');
    });
  });
  
  describe('SSR Mode', () => {
    beforeEach(() => {
      setupSSRMode();
      
      // Override the mock implementation specifically for this test
      global.__platformAsyncRest.mockImplementation((name, verb, params, context) => {
        if (name === 'Misc/Debug:request') {
          return Promise.resolve({
            result: 'success',
            data: {
              headers: { 'user-agent': 'Jest Test' },
              ip: '127.0.0.1',
              method: verb || 'GET',
              path: '/api/Misc/Debug:request'
            }
          });
        } else if (name === 'Misc/Debug:params') {
          return Promise.resolve({
            result: 'success',
            data: params || { empty: true }
          });
        } else {
          return Promise.resolve({
            result: 'success',
            data: { mock: 'data' }
          });
        }
      });
    });
    
    test('Misc/Debug:request returns request info in SSR mode', async () => {
      const response = await klbfw.rest('Misc/Debug:request', 'GET');
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toHaveProperty('ip', '127.0.0.1');
      expect(__platformAsyncRest).toHaveBeenCalledWith('Misc/Debug:request', 'GET', undefined, expect.any(Object));
    });
    
    test('Misc/Debug:params returns passed parameters in SSR mode', async () => {
      const testParams = { foo: 'bar', num: 123, arr: [1, 2, 3] };
      const response = await klbfw.rest('Misc/Debug:params', 'POST', testParams);
      expect(response).toHaveProperty('result', 'success');
      expect(response.data).toEqual(testParams);
      expect(__platformAsyncRest).toHaveBeenCalledWith('Misc/Debug:params', 'POST', testParams, expect.any(Object));
    });
  });
});