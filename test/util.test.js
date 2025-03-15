'use strict';

const util = require('../util');
const { setupSSRMode, setupClientMode, resetMocks } = require('./setup');

describe('Utility Module', () => {
  beforeEach(() => {
    resetMocks();
    
    // Mock fetch response for i18n calls
    global.fetch = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          "hello": "Hello",
          "goodbye": "Goodbye"
        })
      });
    });
  });
  
  describe('getI18N', () => {
    test('fetches locale data with specified language', async () => {
      const i18n = await util.getI18N('en-US');
      expect(fetch).toHaveBeenCalledWith('/_special/locale/en-US.json');
      expect(i18n).toHaveProperty('hello', 'Hello');
    });
    
    test('uses FW.Locale if no language specified', async () => {
      // FW.Locale is set to en-US in setup
      const i18n = await util.getI18N();
      expect(fetch).toHaveBeenCalledWith('/_special/locale/en-US.json');
      expect(i18n).toHaveProperty('hello', 'Hello');
    });
  });
  
  describe('Utility Functions', () => {
    test('trimPrefix processes URL correctly', () => {
      const result = util.trimPrefix('/l/en-US/path');
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('l', 'en-US');
      expect(result[1]).toBe('/path');
    });
  });
});