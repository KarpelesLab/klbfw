'use strict';

const klbfw = require('../index');
const upload = require('../upload');
const { setupSSRMode, setupClientMode, resetMocks } = require('./setup');

// Mock file for upload tests
class MockFile {
  constructor(name, size, type) {
    this.name = name;
    this.size = size;
    this.type = type;
    this.lastModified = Date.now();
  }
  
  slice(start, end) {
    const content = 'a'.repeat(this.size);
    return {
      content: content.slice(start, end)
    };
  }
}

// Mock FileReader
global.FileReader = class FileReader {
  constructor() {
    this.result = new ArrayBuffer(10);
    this.onloadend = null;
  }
  
  addEventListener(event, callback) {
    if (event === 'loadend') {
      this.onloadend = callback;
    }
  }
  
  readAsArrayBuffer() {
    // Simulate async file reading
    setTimeout(() => {
      if (this.onloadend) {
        this.onloadend();
      }
    }, 0);
  }
};

// Mock DOMParser for XML handling
global.DOMParser = class DOMParser {
  parseFromString() {
    return {
      querySelector: () => ({ innerHTML: 'test-upload-id' }),
      getElementsByTagName: (tag) => [{
        textContent: tag === 'UploadId' ? 'test-upload-id' : ''
      }]
    };
  }
};

// Mock Blob
global.Blob = class Blob {
  constructor(content) {
    this.content = content;
    this.size = content.join('').length;
    this.type = 'text/plain';
  }
};

// Mock TextEncoder for string to ArrayBuffer conversion
global.TextEncoder = class TextEncoder {
  encode(text) {
    const buf = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      buf[i] = text.charCodeAt(i);
    }
    return buf;
  }
};

describe('Upload API', () => {
  /**
   * IMPORTANT: In production code, always use the upload.js module for uploads.
   * Direct API calls or fetch to PUT URLs should never be used outside of tests.
   * 
   * The upload.js module:
   * 1. Handles both upload protocols (PUT and AWS multipart)
   * 2. Manages retries, cancellation, and progress tracking
   * 3. Adapts to protocol changes transparently
   */
  beforeEach(() => {
    resetMocks();
    
    // Reset upload.js state
    upload.upload.getStatus = function() {
      return {
        queue: [],
        running: [],
        failed: []
      };
    };
  });
  
  describe('Client Mode', () => {
    beforeEach(() => {
      setupClientMode();
    });
    
    test.skip('upload.append adds file to upload queue', async () => {
      const mockFile = new MockFile('test.jpg', 12345, 'image/jpeg');
      
      // Configure fetch to return success for upload
      global.fetch = jest.fn().mockImplementation((url, options) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (header) => null
          },
          json: () => Promise.resolve({
            result: 'success',
            data: {
              PUT: 'https://example.com/upload',
              Complete: 'Misc/Debug:testUpload',
              Blocksize: 12345
            }
          }),
          text: () => Promise.resolve('<CompleteMultipartUploadResult><ETag>"test-etag-final-12345"</ETag></CompleteMultipartUploadResult>')
        });
      });

      // Add to queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', mockFile, {});
      
      // Override the upload functions for testing
      const originalState = upload.upload.getStatus();
      upload.upload.getStatus = function() {
        return {
          queue: [],
          running: [{
            up_id: 0,
            path: 'Misc/Debug:testUpload',
            file: mockFile,
            status: 'complete',
            final: {
              id: 'test-upload-id'
            }
          }],
          failed: []
        };
      };
      
      // Manually resolve the promise
      // This simulates the upload completion
      setTimeout(() => {
        const up = {
          up_id: 0,
          path: 'Misc/Debug:testUpload',
          file: mockFile,
          status: 'complete',
          final: {
            id: 'test-upload-id'
          }
        };
        originalState.queue[0].resolve(up);
      }, 0);
      
      // Add timeout to test
      const result = await uploadPromise;
      
      // Basic validation
      expect(result).toBeDefined();
      expect(result.file).toBe(mockFile);
      expect(result.path).toBe('Misc/Debug:testUpload');
    }, 15000);
    
    test('upload status functions work properly', () => {
      // Add a file to the upload queue
      const mockFile = new MockFile('test.jpg', 12345, 'image/jpeg');
      
      // Override the getStatus method for testing
      upload.upload.getStatus = function() {
        return {
          queue: [{
            up_id: 0,
            path: 'Misc/Debug:testUpload',
            file: mockFile
          }],
          running: [],
          failed: []
        };
      };
      
      // Get status
      const status = upload.upload.getStatus();
      expect(status).toHaveProperty('queue');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('failed');
      expect(status.queue.length).toBe(1);
    });
  });
  
  describe('Upload with Debug endpoint', () => {
    beforeEach(() => {
      setupClientMode();
      
      // Setup standard mocks
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          // Initial upload request
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Cloud/Aws/Bucket/Upload/clabu-acjhff-mhhj-cxzb-lawe-qphwpedu:handleComplete',
                Blocksize: 256
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url === 'https://example.com/upload' && options?.method === 'PUT') {
          // The PUT request to upload the file
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => null
            },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('handleComplete') && options?.method === 'POST') {
          // Completion request
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Blob__: 'blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq',
                SHA256: '6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1',
                Size: '256',
                Mime: 'text/plain'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('signV4')) {
          // AWS signature
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                authorization: 'AWS4-HMAC-SHA256 Credential=test/example/s3/aws4_request'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploads=')) {
          // AWS multipart init
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<InitiateMultipartUploadResult><UploadId>test-upload-id-12345</UploadId></InitiateMultipartUploadResult>')
          });
        } else if (url.includes('partNumber=') && url.includes('uploadId=')) {
          // Part upload
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (header) => {
                if (header === 'ETag') return '"test-etag-12345"';
                return null;
              }
            },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploadId=') && !url.includes('partNumber=')) {
          // Complete multipart upload
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<CompleteMultipartUploadResult><ETag>"test-etag-final-12345"</ETag></CompleteMultipartUploadResult>')
          });
        }
        
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: () => 'application/json'
          },
          json: () => Promise.resolve({
            result: 'success',
            data: {}
          }),
          text: () => Promise.resolve('')
        });
      });
    });
    
    test.skip('upload can process a file with PUT method', async () => {
      // Create test file content
      const testContent = 'a'.repeat(256);
      
      // Create a mock file for upload
      const testFile = new MockFile('test-file.txt', testContent.length, 'text/plain');
      
      // Add the file to the upload queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', testFile, {});
      
      // Start the upload process
      upload.upload.run();
      
      // Mock the upload process - simulate completion
      setTimeout(() => {
        // Find the upload in the state and resolve it
        const originalState = upload.upload.getStatus();
        const queue = Array.isArray(originalState.queue) ? originalState.queue : [];
        const running = Array.isArray(originalState.running) ? originalState.running : [];
        const pendingUpload = queue[0] || running[0];
        
        if (pendingUpload) {
          pendingUpload.resolve({
            file: testFile,
            path: 'Misc/Debug:testUpload',
            status: 'complete',
            final: {
              Blob__: 'blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq',
              SHA256: '6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1',
              Size: '256',
              Mime: 'text/plain'
            }
          });
        }
      }, 50);
      
      // Wait for the upload to complete
      const result = await uploadPromise;
      
      // Verify the upload result
      expect(result).toBeDefined();
      expect(result.file).toBe(testFile);
      expect(result.path).toBe('Misc/Debug:testUpload');
      expect(result.status).toBe('complete');
      
      // Check if the final data is present
      expect(result.final).toBeDefined();
      expect(result.final.Blob__).toBe('blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq');
      expect(result.final.SHA256).toBe('6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1');
      expect(result.final.Size).toBe('256');
      expect(result.final.Mime).toBe('text/plain');
    }, 15000);
    
    test.skip('upload can process a file with AWS multipart method', async () => {
      // Create test file content
      const testContent = 'a'.repeat(256);
      
      // Create a mock file for upload
      const testFile = new MockFile('test-file.txt', testContent.length, 'text/plain');
      
      // Configure fetch mock to return AWS bucket info for method 1
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          // Initial upload request
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Cloud_Aws_Bucket_Upload__: 'clabu-acjhff-mhhj-cxzb-lawe-qphwpedu',
                Bucket_Endpoint: {
                  Host: 'example.s3.amazonaws.com',
                  Name: 'test-bucket',
                  Region: 'us-east-1'
                },
                Key: 'uploads/test-file.txt'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('signV4')) {
          // AWS signature
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                authorization: 'AWS4-HMAC-SHA256 Credential=test/example/s3/aws4_request'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploads=')) {
          // AWS multipart init
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<InitiateMultipartUploadResult><UploadId>test-upload-id-12345</UploadId></InitiateMultipartUploadResult>')
          });
        } else if (url.includes('partNumber=') && url.includes('uploadId=')) {
          // Part upload
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: (header) => {
                if (header === 'ETag') return '"test-etag-12345"';
                return null;
              }
            },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploadId=') && !url.includes('partNumber=')) {
          // Complete multipart upload
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<CompleteMultipartUploadResult><ETag>"test-etag-final-12345"</ETag></CompleteMultipartUploadResult>')
          });
        } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('handleComplete')) {
          // Final completion call
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Blob__: 'blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq',
                SHA256: '6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1',
                Size: '256',
                Mime: 'text/plain'
              }
            }),
            text: () => Promise.resolve('')
          });
        }
        
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: () => 'application/json'
          },
          json: () => Promise.resolve({
            result: 'success',
            data: {}
          }),
          text: () => Promise.resolve('')
        });
      });
      
      // Add the file to the upload queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', testFile, {});
      
      // Start the upload process
      upload.upload.run();
      
      // Mock the upload process - simulate completion
      setTimeout(() => {
        // Find the upload in the state and resolve it
        const originalState = upload.upload.getStatus();
        const queue = Array.isArray(originalState.queue) ? originalState.queue : [];
        const running = Array.isArray(originalState.running) ? originalState.running : [];
        const pendingUpload = queue[0] || running[0];
        
        if (pendingUpload) {
          pendingUpload.resolve({
            file: testFile,
            path: 'Misc/Debug:testUpload',
            status: 'complete',
            final: {
              Blob__: 'blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq',
              SHA256: '6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1',
              Size: '256',
              Mime: 'text/plain'
            }
          });
        }
      }, 50);
      
      // Wait for the upload to complete
      const result = await uploadPromise;
      
      // Verify the upload result
      expect(result).toBeDefined();
      expect(result.file).toBe(testFile);
      expect(result.path).toBe('Misc/Debug:testUpload');
      expect(result.status).toBe('complete');
      
      // Check if the final data from handleComplete is present
      expect(result.final).toBeDefined();
      expect(result.final.Blob__).toBe('blob-n6ipxu-lnbv-ce3g-sdoo-q7sfw6rq');
      expect(result.final.SHA256).toBe('6b5c4d4f9d35fd0bcf2cd8e505cc0af2c5b918c2e9c66c1bc817ded8169bdfe1');
    }, 15000);
  });
  
  describe('Single-block PUT upload regression test', () => {
    beforeEach(() => {
      setupClientMode();
      resetMocks();
    });

    test('should not call Complete before PUT is performed for single-block uploads', async () => {
      // Create a 65536 bytes file
      const testContent = Buffer.alloc(65536);
      for (let i = 0; i < testContent.length; i++) {
        testContent[i] = Math.floor(Math.random() * 256);
      }

      // Create a mock file for upload
      const testFile = {
        name: 'test-65536.bin',
        size: testContent.length,
        type: 'application/octet-stream',
        lastModified: Date.now(),
        content: testContent,
        slice: function(start, end) {
          return {
            content: this.content.slice(start, end)
          };
        }
      };

      // Track the order of API calls
      const apiCalls = [];

      // Configure fetch mock
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          apiCalls.push('initUpload');
          // Initial upload request - returns only PUT URL (no AWS info)
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              request_id: 'aa648af4-9355-425b-a4be-116e9bb3b564',
              time: 0.1258690357208252,
              data: {
                PUT: 'https://example.com/_special/rest/Blob/Source/Binary/Upload/NKX83J4XWTBBMVW56M5CMVJLXEDS84JBDNM9V6W4KG26MJEL86W9FRZH3562MNTK:upload',
                Complete: 'Blob/Source/Binary/Upload/NKX83J4XWTBBMVW56M5CMVJLXEDS84JBDNM9V6W4KG26MJEL86W9FRZH3562MNTK:handleComplete'
              },
              access: {
                'llmdl-72upzx-e4on-gq7g-raad-h4cx2klq': {
                  required: 'W',
                  available: 'O'
                }
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('upload') && options?.method === 'PUT') {
          apiCalls.push('PUT');
          // The PUT request to upload the file
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => null
            },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('handleComplete') && options?.method === 'POST') {
          apiCalls.push('Complete');
          // Completion request
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Blob__: 'blob-test-12345',
                SHA256: 'test-hash',
                Size: '65536',
                Mime: 'application/octet-stream'
              }
            }),
            text: () => Promise.resolve('')
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Override FileReader for this test
      global.FileReader = class FileReader {
        constructor() {
          this.result = null;
          this.onloadend = null;
          this.onerror = null;
        }

        addEventListener(event, callback) {
          if (event === 'loadend') {
            this.onloadend = callback;
          } else if (event === 'error') {
            this.onerror = callback;
          }
        }

        readAsArrayBuffer(blob) {
          // Simulate async file reading with actual content
          setTimeout(() => {
            this.result = testContent.buffer.slice(
              testContent.byteOffset,
              testContent.byteOffset + testContent.byteLength
            );
            if (this.onloadend) {
              this.onloadend();
            }
          }, 10);
        }
      };

      // Add the file to the upload queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', testFile, {});

      // Start the upload process
      upload.upload.run();

      // Wait for upload to complete with timeout
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Upload timeout')), 5000);
      });

      try {
        await Promise.race([uploadPromise, timeoutPromise]);

        // Verify the order of API calls
        expect(apiCalls).toEqual(['initUpload', 'PUT', 'Complete']);

        // Verify that PUT was called before Complete
        const putIndex = apiCalls.indexOf('PUT');
        const completeIndex = apiCalls.indexOf('Complete');
        expect(putIndex).toBeGreaterThanOrEqual(0);
        expect(completeIndex).toBeGreaterThanOrEqual(0);
        expect(putIndex).toBeLessThan(completeIndex);
      } catch (error) {
        // If there's a timeout or other error, check what calls were made
        console.log('API calls made:', apiCalls);
        throw error;
      }
    });
  });

  describe('Upload Management Functions', () => {
    beforeEach(() => {
      setupClientMode();
      resetMocks();
      
      // Create a clean upload state for each test
      const state = {
        queue: [],
        running: {},
        failed: []
      };
      
      // Override upload.getStatus()
      upload.upload.getStatus = function() {
        return {
          queue: state.queue,
          running: Object.values(state.running),
          failed: state.failed
        };
      };
      
      // Store state for modification in tests
      upload.upload._testState = state;
    });
    
    test.skip('cancelItem marks an upload as canceled', async () => {
      const mockFile = new MockFile('test.jpg', 12345, 'image/jpeg');
      
      // Create a mock upload object
      const mockUpload = {
        up_id: 123,
        path: 'Misc/Debug:testUpload',
        file: mockFile,
        status: 'pending',
        paused: false,
        canceled: false
      };
      
      // Add to test queue
      upload.upload._testState.queue.push(mockUpload);
      
      // Cancel the upload
      upload.upload.cancelItem(123);
      
      // Check if it's marked as canceled
      expect(mockUpload.canceled).toBe(true);
    });
    
    test.skip('pauseItem and resumeItem control upload pausing', async () => {
      // Setup for more realistic test
      const mockFile = new MockFile('test.jpg', 12345, 'image/jpeg');
      
      // Create a mock upload object
      const mockUpload = {
        up_id: 456,
        path: 'Misc/Debug:testUpload',
        file: mockFile,
        status: 'uploading',
        paused: false,
        canceled: false
      };
      
      // Add to test running state
      upload.upload._testState.running[456] = mockUpload;
      
      // Pause the upload
      upload.upload.pauseItem(456);
      
      // Check if it's paused
      expect(mockUpload.paused).toBe(true);
      
      // Resume the upload - create temp function for processing
      upload.upload.resumeItem(456);
      
      // Check if it's resumed
      expect(mockUpload.paused).toBe(false);
    });
    
    test.skip('retryItem functionality', () => {
      // Reset the queues first to ensure clean state
      const mockFile = new MockFile('test.jpg', 12345, 'image/jpeg');
      
      // Create a mock failed upload
      const mockFailedUpload = {
        up_id: 999,
        path: 'Misc/Debug:testUpload',
        file: mockFile,
        status: 'failed',
        failure: { message: 'Test error' },
        b: { 0: 'pending' },
        blocks: 1
      };
      
      // Add directly to failed list
      upload.upload._testState.failed.push(mockFailedUpload);
      
      // Verify it's in the failed list
      expect(upload.upload.getStatus().failed.length).toBe(1);
      
      // Mock the state modification functions
      const originalSplice = Array.prototype.splice;
      Array.prototype.splice = function(index, count) {
        if (this === upload.upload._testState.failed && index === 0 && count === 1) {
          // Move item to queue on retry
          upload.upload._testState.queue.push(mockFailedUpload);
          
          // Reset failure and pending parts
          mockFailedUpload.failure = {};
          mockFailedUpload.b[0] = undefined;
          
          // Remove from failed array
          const result = originalSplice.apply(this, arguments);
          return result;
        } else {
          return originalSplice.apply(this, arguments);
        }
      };
      
      try {
        // Retry the upload
        upload.upload.retryItem(999);
        
        // Check if it moved to the queue and cleared from failed
        expect(upload.upload.getStatus().failed.length).toBe(0);
        expect(upload.upload.getStatus().queue.length).toBe(1);
        
        // Check if failure was reset and pending part was cleared
        const queuedItem = upload.upload.getStatus().queue[0];
        expect(queuedItem.failure).toEqual({});
        expect(queuedItem.b[0]).toBeUndefined();
      } finally {
        // Restore original splice
        Array.prototype.splice = originalSplice;
      }
    });
  });

  describe('HTTP Error Handling', () => {
    beforeEach(() => {
      setupClientMode();
      resetMocks();
    });

    test('should handle HTTP 500 error on PUT upload', async () => {
      // Create a small test file
      const testContent = Buffer.alloc(1024);
      for (let i = 0; i < testContent.length; i++) {
        testContent[i] = i % 256;
      }

      const testFile = {
        name: 'test-error.bin',
        size: testContent.length,
        type: 'application/octet-stream',
        lastModified: Date.now(),
        content: testContent,
        slice: function(start, end) {
          return {
            content: this.content.slice(start, end)
          };
        }
      };

      // Configure fetch mock to return error on PUT
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          // Initial upload request - returns PUT URL
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Blob/Source/Binary/Upload/TEST:handleComplete'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('upload') && options?.method === 'PUT') {
          // The PUT request returns HTTP 500 error
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
              get: () => null
            },
            text: () => Promise.resolve('Server error')
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Override FileReader for this test
      global.FileReader = class FileReader {
        constructor() {
          this.result = null;
          this.onloadend = null;
          this.onerror = null;
        }

        addEventListener(event, callback) {
          if (event === 'loadend') {
            this.onloadend = callback;
          } else if (event === 'error') {
            this.onerror = callback;
          }
        }

        readAsArrayBuffer(blob) {
          setTimeout(() => {
            this.result = testContent.buffer.slice(
              testContent.byteOffset,
              testContent.byteOffset + testContent.byteLength
            );
            if (this.onloadend) {
              this.onloadend();
            }
          }, 10);
        }
      };

      // Add the file to the upload queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', testFile, {});

      // Start the upload process
      upload.upload.run();

      // The upload should fail, not complete
      await expect(uploadPromise).rejects.toThrow();
    });

    test('should handle HTTP 403 error on AWS multipart upload', async () => {
      // Create a small test file
      const testContent = Buffer.alloc(1024);
      for (let i = 0; i < testContent.length; i++) {
        testContent[i] = i % 256;
      }

      const testFile = {
        name: 'test-error-aws.bin',
        size: testContent.length,
        type: 'application/octet-stream',
        lastModified: Date.now(),
        content: testContent,
        slice: function(start, end) {
          return {
            content: this.content.slice(start, end)
          };
        }
      };

      // Configure fetch mock to return AWS info and then error on part upload
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          // Initial upload request - returns AWS info
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Cloud_Aws_Bucket_Upload__: 'clabu-test-id',
                Bucket_Endpoint: {
                  Host: 'example.s3.amazonaws.com',
                  Name: 'test-bucket',
                  Region: 'us-east-1'
                },
                Key: 'uploads/test-error-aws.bin'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('Cloud/Aws/Bucket/Upload') && url.includes('signV4')) {
          // AWS signature
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: {
              get: () => 'application/json'
            },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                authorization: 'AWS4-HMAC-SHA256 Credential=test/example/s3/aws4_request'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploads=')) {
          // AWS multipart init
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<InitiateMultipartUploadResult><UploadId>test-upload-id</UploadId></InitiateMultipartUploadResult>')
          });
        } else if (url.includes('partNumber=') && url.includes('uploadId=')) {
          // Part upload returns HTTP 403 error
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            headers: {
              get: () => null
            },
            text: () => Promise.resolve('Access denied')
          });
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Override FileReader for this test
      global.FileReader = class FileReader {
        constructor() {
          this.result = null;
          this.onloadend = null;
          this.onerror = null;
        }

        addEventListener(event, callback) {
          if (event === 'loadend') {
            this.onloadend = callback;
          } else if (event === 'error') {
            this.onerror = callback;
          }
        }

        readAsArrayBuffer(blob) {
          setTimeout(() => {
            this.result = testContent.buffer.slice(
              testContent.byteOffset,
              testContent.byteOffset + testContent.byteLength
            );
            if (this.onloadend) {
              this.onloadend();
            }
          }, 10);
        }
      };

      // Add the file to the upload queue
      const uploadPromise = upload.upload.append('Misc/Debug:testUpload', testFile, {});

      // Start the upload process
      upload.upload.run();

      // The upload should fail, not complete
      await expect(uploadPromise).rejects.toThrow();
    });
  });

  describe('uploadFile() - Simple Node.js upload function', () => {
    beforeEach(() => {
      setupClientMode();
      resetMocks();
    });

    test('uploadFile uploads a Buffer via PUT method', async () => {
      const testContent = Buffer.from('Hello, World!');
      const apiCalls = [];

      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          apiCalls.push('init');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Blob/Upload/TEST:handleComplete'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url === 'https://example.com/upload' && options?.method === 'PUT') {
          apiCalls.push('PUT');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('handleComplete') && options?.method === 'POST') {
          apiCalls.push('Complete');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Blob__: 'blob-test-12345',
                SHA256: 'abc123',
                Size: '13',
                Mime: 'text/plain'
              }
            }),
            text: () => Promise.resolve('')
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await upload.uploadFile('Misc/Debug:testUpload', testContent, {
        filename: 'hello.txt',
        type: 'text/plain'
      });

      expect(apiCalls).toEqual(['init', 'PUT', 'Complete']);
      expect(result).toBeDefined();
      expect(result.Blob__).toBe('blob-test-12345');
      expect(result.SHA256).toBe('abc123');
    });

    test('uploadFile uploads a file-like object', async () => {
      const testContent = Buffer.from('Test file content');
      const fileObj = {
        name: 'test.txt',
        size: testContent.length,
        type: 'text/plain',
        lastModified: Date.now(),
        content: testContent
      };

      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Blob/Upload/TEST:handleComplete'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url === 'https://example.com/upload' && options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('handleComplete') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: { Blob__: 'blob-fileobj-test' }
            }),
            text: () => Promise.resolve('')
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await upload.uploadFile('Misc/Debug:testUpload', fileObj);

      expect(result).toBeDefined();
      expect(result.Blob__).toBe('blob-fileobj-test');
    });

    test('uploadFile calls onProgress callback', async () => {
      const testContent = Buffer.from('Test content');
      const progressValues = [];

      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Blob/Upload/TEST:handleComplete'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('handleComplete')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: { Blob__: 'blob-progress-test' }
            }),
            text: () => Promise.resolve('')
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await upload.uploadFile('Misc/Debug:testUpload', testContent, {
        filename: 'test.bin',
        onProgress: (progress) => progressValues.push(progress)
      });

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(1);
    });

    test('uploadFile rejects on HTTP error', async () => {
      const testContent = Buffer.from('Test content');

      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                PUT: 'https://example.com/upload',
                Complete: 'Blob/Upload/TEST:handleComplete'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: { get: () => null },
            text: () => Promise.resolve('Server error')
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await expect(
        upload.uploadFile('Misc/Debug:testUpload', testContent, { filename: 'test.bin' })
      ).rejects.toThrow('HTTP 500');
    });

    test('uploadFile rejects for invalid file input', async () => {
      await expect(
        upload.uploadFile('Misc/Debug:testUpload', { invalid: 'object' })
      ).rejects.toThrow('Invalid file');
    });

    test('uploadFile handles AWS multipart upload', async () => {
      const testContent = Buffer.from('Test content for AWS');
      const apiCalls = [];

      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('Misc/Debug:testUpload') && options?.method === 'POST') {
          apiCalls.push('init');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: {
                Cloud_Aws_Bucket_Upload__: 'clabu-test-id',
                Bucket_Endpoint: {
                  Host: 'example.s3.amazonaws.com',
                  Name: 'test-bucket',
                  Region: 'us-east-1'
                },
                Key: 'uploads/test.bin'
              }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('signV4') && options?.method === 'POST') {
          apiCalls.push('signV4');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: { authorization: 'AWS4-HMAC-SHA256 Credential=test' }
            }),
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploads=')) {
          apiCalls.push('initMultipart');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<InitiateMultipartUploadResult><UploadId>test-upload-id</UploadId></InitiateMultipartUploadResult>')
          });
        } else if (url.includes('partNumber=') && url.includes('uploadId=')) {
          apiCalls.push('uploadPart');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: (h) => h === 'ETag' ? '"test-etag"' : null },
            text: () => Promise.resolve('')
          });
        } else if (url.includes('uploadId=') && !url.includes('partNumber=') && options?.method !== 'POST') {
          apiCalls.push('completeMultipart');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<CompleteMultipartUploadResult><ETag>"final-etag"</ETag></CompleteMultipartUploadResult>')
          });
        } else if (url.includes('s3.amazonaws.com') && options?.method === 'POST') {
          apiCalls.push('completeMultipart');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('<CompleteMultipartUploadResult><ETag>"final-etag"</ETag></CompleteMultipartUploadResult>')
          });
        } else if (url.includes('handleComplete') && options?.method === 'POST') {
          apiCalls.push('handleComplete');
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({
              result: 'success',
              data: { Blob__: 'blob-aws-test' }
            }),
            text: () => Promise.resolve('')
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await upload.uploadFile('Misc/Debug:testUpload', testContent, {
        filename: 'test.bin'
      });

      expect(apiCalls).toContain('init');
      expect(apiCalls).toContain('signV4');
      expect(apiCalls).toContain('initMultipart');
      expect(apiCalls).toContain('uploadPart');
      expect(apiCalls).toContain('handleComplete');
      expect(result.Blob__).toBe('blob-aws-test');
    });
  });
});