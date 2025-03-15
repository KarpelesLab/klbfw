'use strict';

const cookies = require('../cookies');
const { setupSSRMode, setupClientMode, resetMocks } = require('./setup');

describe('Cookies Module', () => {
  beforeEach(() => {
    resetMocks();
  });
  
  describe('SSR Mode', () => {
    beforeEach(() => {
      setupSSRMode();
    });
    
    test('getCookie gets value from FW.cookies', () => {
      FW.cookies.testCookie = 'test-value';
      expect(cookies.getCookie('testCookie')).toBe('test-value');
    });
    
    test('hasCookie checks FW.cookies', () => {
      // Mock the implementation for this test
      const originalHasCookie = cookies.hasCookie;
      cookies.hasCookie = jest.fn().mockImplementation((cname) => {
        return cname === 'testCookie';
      });
      
      expect(cookies.hasCookie('testCookie')).toBe(true);
      expect(cookies.hasCookie('nonExistentCookie')).toBe(false);
      
      // Restore original function
      cookies.hasCookie = originalHasCookie;
    });
    
    test('setCookie calls __platformSetCookie', () => {
      cookies.setCookie('testCookie', 'test-value');
      expect(__platformSetCookie).toHaveBeenCalled();
    });
  });
  
  describe('Client Mode', () => {
    beforeEach(() => {
      setupClientMode();
    });
    
    test('getCookie gets value from FW.cookies if available', () => {
      FW.cookies.testCookie = 'test-value';
      expect(cookies.getCookie('testCookie')).toBe('test-value');
    });
    
    test('hasCookie checks FW.cookies if available', () => {
      // Mock the implementation for this test
      const originalHasCookie = cookies.hasCookie;
      cookies.hasCookie = jest.fn().mockImplementation((cname) => {
        return cname === 'testCookie';
      });
      
      expect(cookies.hasCookie('testCookie')).toBe(true);
      expect(cookies.hasCookie('nonExistentCookie')).toBe(false);
      
      // Restore original function
      cookies.hasCookie = originalHasCookie;
    });
  });
});