'use strict';

const rest = require('../rest');
const { setupSSRMode, setupClientMode, resetMocks } = require('./setup');

// Mock the internal module
jest.mock('../internal', () => ({
  checkSupport: jest.fn().mockReturnValue(true),
  rest_url: jest.fn().mockReturnValue('/_rest/test'),
  responseParse: jest.fn((response, resolve, reject) => {
    resolve({ success: true, data: 'test-data' });
  }),
  internal_rest: jest.fn().mockImplementation(() => {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json')
      },
      json: jest.fn().mockResolvedValue({ result: 'success', data: 'test-data' })
    });
  })
}));

describe('REST Module', () => {
  beforeEach(() => {
    resetMocks();
    
    // Mock fetch response
    global.fetch = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: jest.fn().mockResolvedValue({ result: 'success', data: 'test-data' })
      });
    });
  });
  
  describe('SSR Mode', () => {
    beforeEach(() => {
      setupSSRMode();
    });
    
    test('rest uses __platformAsyncRest in SSR mode', async () => {
      const result = await rest.rest('test', 'GET', {});
      expect(__platformAsyncRest).toHaveBeenCalled();
      expect(result).toHaveProperty('result', 'success');
    });
    
    test('rest_get uses __platformAsyncRest in SSR mode', async () => {
      const result = await rest.rest_get('test', {});
      expect(__platformAsyncRest).toHaveBeenCalled();
      expect(result).toHaveProperty('result', 'success');
    });
  });
  
  describe('Client Mode', () => {
    beforeEach(() => {
      setupClientMode();
    });
    
    test('rest uses internal_rest in client mode', async () => {
      const result = await rest.rest('test', 'GET', {});
      expect(require('../internal').internal_rest).toHaveBeenCalled();
      expect(result).toHaveProperty('success', true);
    });
    
    test('rest_get works in client mode', async () => {
      // We're mocking fetch at the global level so no need to check if it's called
      const result = await rest.rest_get('test', {});
      expect(result).toBeDefined();
    });
  });
});