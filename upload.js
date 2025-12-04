/**
 * KLB Upload Module
 * 
 * This module handles file uploads to KLB API endpoints.
 * It supports both browser and Node.js environments with a unified API.
 * 
 * The module handles:
 * - File upload to KLB API endpoints
 * - Multiple upload protocols (PUT and AWS multipart)
 * - Progress tracking
 * - Pause, resume, retry, and cancel operations
 * - Browser and Node.js compatibility
 * 
 * Browser usage:
 * ```js
 * // Open file picker and upload selected files
 * upload.init('Misc/Debug:testUpload')()
 *   .then(result => console.log('Upload complete', result));
 *   
 * // Open file picker with custom parameters and notification callback
 * upload.init('Support/Ticket:upload', {image_variation: 'alias=mini&strip&scale_crop=300x200'}, (result) => {
 *   if (result.status == 'complete') console.log(result.final);
 * });
 * 
 * // Upload a specific File object
 * upload.append('Misc/Debug:testUpload', fileObject)
 *   .then(result => console.log('Upload complete', result));
 * 
 * // Track progress
 * upload.onprogress = (status) => {
 *   console.log('Progress:', status.running.map(i => i.status));
 * };
 * 
 * // Cancel an upload
 * upload.cancelItem(uploadId);
 * ```
 * 
 * Node.js usage:
 * ```js
 * // For Node.js environments, first install dependencies:
 * // npm install node-fetch @xmldom/xmldom
 * 
 * // Create a buffer-based file object for upload
 * const file = {
 *   name: 'test.txt',
 *   size: buffer.length,
 *   type: 'text/plain',
 *   content: buffer, // Buffer or ArrayBuffer with file content
 *   lastModified: Date.now(),
 *   slice: function(start, end) {
 *     return {
 *       content: this.content.slice(start, end)
 *     };
 *   }
 * };
 * 
 * upload.append('Misc/Debug:testUpload', file)
 *   .then(result => console.log('Upload complete', result));
 * ```
 * 
 * @module upload
 */

'use strict';

const rest = require('./rest');
const fwWrapper = require('./fw-wrapper');
const sha256 = require('js-sha256').sha256;

/**
 * Environment detection and cross-platform utilities
 */
const env = {
  /**
   * Detect if running in a browser environment
   */
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  
  /**
   * Detect if running in a Node.js environment
   */
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node,
  
  /**
   * Node.js specific modules (lazy-loaded)
   */
  node: {
    fetch: null,
    xmlParser: null,
    EventEmitter: null,
    eventEmitter: null
  }
};

/**
 * Initialize Node.js dependencies when in Node environment
 */
if (env.isNode && !env.isBrowser) {
  try {
    env.node.fetch = require('node-fetch');
    env.node.xmlParser = require('@xmldom/xmldom');
    env.node.EventEmitter = require('events');
    env.node.eventEmitter = new (env.node.EventEmitter)();
  } catch (e) {
    console.warn('Node.js dependencies not available. Some functionality may be limited:', e.message);
    console.warn('To use in Node.js, install: npm install node-fetch @xmldom/xmldom');
  }
}

/**
 * Cross-platform utilities
 */
const utils = {
  /**
   * Environment-agnostic fetch implementation
   * @param {string} url - The URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise} - Fetch promise
   */
  fetch(url, options) {
    if (env.isBrowser && typeof window.fetch === 'function') {
      return window.fetch(url, options);
    } else if (env.isNode && env.node.fetch) {
      return env.node.fetch(url, options);
    } else if (typeof fetch === 'function') {
      // For environments where fetch is globally available
      return fetch(url, options);
    }
    return Promise.reject(new Error('fetch not available in this environment'));
  },

  /**
   * Environment-agnostic XML parser
   * @param {string} xmlString - XML string to parse
   * @returns {Document} - DOM-like document
   */
  parseXML(xmlString) {
    if (env.isBrowser) {
      return new DOMParser().parseFromString(xmlString, 'text/xml');
    } else if (env.isNode && env.node.xmlParser) {
      const DOMParserNode = env.node.xmlParser.DOMParser;
      const dom = new DOMParserNode().parseFromString(xmlString, 'text/xml');
      
      // Add querySelector interface for compatibility
      dom.querySelector = function(selector) {
        if (selector === 'UploadId') {
          const elements = this.getElementsByTagName('UploadId');
          return elements.length > 0 ? { innerHTML: elements[0].textContent } : null;
        }
        return null;
      };
      
      return dom;
    }
    throw new Error('XML parsing not available in this environment');
  },

  /**
   * Read file content as ArrayBuffer
   * Compatible with browser File objects and custom objects with content/slice
   * 
   * @param {File|Object} file - File object or file-like object
   * @param {Object} options - Options for reading (start, end)
   * @param {Function} callback - Callback function(buffer, error)
   */
  readAsArrayBuffer(file, options, callback) {
    // Handle case where options is the callback
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};
    
    if (env.isBrowser && file instanceof File) {
      // Browser: use native File API
      const start = options.start || 0;
      const end = options.end || file.size;
      const slice = file.slice(start, end);
      
      const reader = new FileReader();
      reader.addEventListener('loadend', () => callback(reader.result));
      reader.addEventListener('error', (e) => callback(null, e));
      reader.readAsArrayBuffer(slice);
    } else if (file.content) {
      // Memory buffer-based file
      const start = options.start || 0;
      const end = options.end || file.content.length || file.content.byteLength;
      let content = file.content;
      
      // Handle various content types
      if (content instanceof ArrayBuffer) {
        // Already an ArrayBuffer
        if (start === 0 && end === content.byteLength) {
          callback(content);
        } else {
          callback(content.slice(start, end));
        }
      } else if (content.buffer instanceof ArrayBuffer) {
        // TypedArray (Uint8Array, etc.)
        callback(content.buffer.slice(start, end));
      } else if (typeof Buffer !== 'undefined' && content instanceof Buffer) {
        // Node.js Buffer
        const arrayBuffer = content.buffer.slice(
          content.byteOffset + start,
          content.byteOffset + Math.min(end, content.byteLength)
        );
        callback(arrayBuffer);
      } else if (typeof content === 'string') {
        // String content - convert to ArrayBuffer
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(content.slice(start, end));
        callback(uint8Array.buffer);
      } else {
        callback(null, new Error('Unsupported content type'));
      }
    } else if (file.slice) {
      // Object with slice method (custom implementation)
      const start = options.start || 0;
      const end = options.end;
      const slice = file.slice(start, end);
      
      // Recursively handle the slice
      utils.readAsArrayBuffer(slice, callback);
    } else {
      callback(null, new Error('Cannot read file content - no supported method available'));
    }
  },

  /**
   * Dispatch a custom event in any environment
   * @param {string} eventName - Event name
   * @param {Object} detail - Event details
   */
  dispatchEvent(eventName, detail) {
    if (env.isBrowser) {
      const evt = new CustomEvent(eventName, { detail });
      document.dispatchEvent(evt);
    } else if (env.isNode && env.node.eventEmitter) {
      env.node.eventEmitter.emit(eventName, detail);
    }
    // In other environments, events are silently ignored
  },

  /**
   * Format a date for AWS (YYYYMMDDTHHMMSSZ)
   * @returns {string} Formatted date
   */
  getAmzTime() {
    const t = new Date();
    return t.getUTCFullYear() +
      this.pad(t.getUTCMonth() + 1) +
      this.pad(t.getUTCDate()) +
      'T' + this.pad(t.getUTCHours()) +
      this.pad(t.getUTCMinutes()) +
      this.pad(t.getUTCSeconds()) +
      'Z';
  },

  /**
   * Pad a number with leading zero if needed
   * @param {number} number - Number to pad
   * @returns {string} Padded number
   */
  pad(number) {
    return number < 10 ? '0' + number : String(number);
  }
};

/**
 * Simple file upload for Node.js consumers
 *
 * This function provides a straightforward way to upload a file and get a Promise
 * that resolves when the upload is complete. It doesn't use global state or the
 * upload.run() process.
 *
 * @param {string} api - API endpoint path (e.g., 'Misc/Debug:testUpload')
 * @param {Buffer|ArrayBuffer|Uint8Array|File|Object} buffer - File to upload. Can be:
 *   - A Node.js Buffer
 *   - An ArrayBuffer
 *   - A Uint8Array or other TypedArray
 *   - A browser File object
 *   - A file-like object with { name, size, type, content, lastModified }
 *   - A string (will be converted to UTF-8 bytes)
 * @param {string} [method='POST'] - HTTP method for the initial API call
 * @param {Object} [params={}] - Additional parameters to send with the upload.
 *   Can include `filename` and `type` to override defaults.
 * @param {Object} [context=null] - Request context (uses default context if not provided)
 * @param {Object} [options={}] - Upload options
 * @param {Function} [options.onProgress] - Progress callback(progress) where progress is 0-1
 * @param {Function} [options.onError] - Error callback(error, context). Can return a Promise
 *   that, if resolved, will cause the failed operation to be retried. Context contains
 *   { phase, blockNum, attempt } for block uploads or { phase, attempt } for other operations.
 * @returns {Promise<Object>} - Resolves with the upload result data
 *
 * @example
 * // Upload a buffer with filename
 * const buffer = Buffer.from('Hello, World!');
 * const result = await uploadFile('Misc/Debug:testUpload', buffer, 'POST', {
 *   filename: 'hello.txt',
 *   type: 'text/plain'
 * });
 *
 * @example
 * // Upload with progress and error handling
 * const result = await uploadFile('Misc/Debug:testUpload', buffer, 'POST', {
 *   filename: 'large-file.bin'
 * }, null, {
 *   onProgress: (progress) => console.log(`${Math.round(progress * 100)}%`),
 *   onError: async (error, ctx) => {
 *     console.log(`Error in ${ctx.phase}, attempt ${ctx.attempt}:`, error.message);
 *     if (ctx.attempt < 3) {
 *       await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
 *       return; // Resolve to trigger retry
 *     }
 *     throw error; // Give up after 3 attempts
 *   }
 * });
 *
 * @example
 * // Upload a File object (browser)
 * const result = await uploadFile('Misc/Debug:testUpload', fileInput.files[0]);
 */
async function uploadFile(api, buffer, method, params, context, options) {
    // Handle default values
    method = method || 'POST';
    params = params || {};
    options = options || {};

    // Get context from framework if not provided, and add available values
    if (!context) {
        context = fwWrapper.getContext();
    } else {
        // Merge with default context values if available
        const defaultContext = fwWrapper.getContext();
        if (defaultContext) {
            context = { ...defaultContext, ...context };
        }
    }

    // Normalize buffer to a file-like object
    let fileObj;

    // Handle string input
    if (typeof buffer === 'string') {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(buffer);
        fileObj = {
            name: params.filename || 'file.txt',
            size: uint8Array.length,
            type: params.type || 'text/plain',
            lastModified: Date.now(),
            content: uint8Array.buffer
        };
    }
    // Handle ArrayBuffer
    else if (buffer instanceof ArrayBuffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.byteLength,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now(),
            content: buffer
        };
    }
    // Handle TypedArray (Uint8Array, etc.)
    else if (buffer && buffer.buffer instanceof ArrayBuffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.byteLength,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now(),
            content: buffer
        };
    }
    // Handle Node.js Buffer
    else if (typeof Buffer !== 'undefined' && buffer instanceof Buffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.length,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now(),
            content: buffer
        };
    }
    // Handle browser File object
    else if (env.isBrowser && typeof File !== 'undefined' && buffer instanceof File) {
        fileObj = {
            name: buffer.name || params.filename || 'file.bin',
            size: buffer.size,
            type: buffer.type || params.type || 'application/octet-stream',
            lastModified: buffer.lastModified || Date.now(),
            browserFile: buffer  // Keep reference to original File for reading
        };
    }
    // Handle file-like object with content property
    else if (buffer && buffer.content !== undefined) {
        fileObj = {
            name: buffer.name || params.filename || 'file.bin',
            size: buffer.size || buffer.content.byteLength || buffer.content.length,
            type: buffer.type || params.type || 'application/octet-stream',
            lastModified: buffer.lastModified || Date.now(),
            content: buffer.content
        };
    }
    else {
        throw new Error('Invalid file: must be a Buffer, ArrayBuffer, Uint8Array, File, string, or file-like object with content');
    }

    // Merge params with file metadata (file metadata takes precedence for these fields)
    const uploadParams = { ...params };
    uploadParams.filename = fileObj.name;
    uploadParams.size = fileObj.size;
    uploadParams.lastModified = fileObj.lastModified / 1000;
    uploadParams.type = fileObj.type;

    // Initialize upload with the server
    const response = await rest.rest(api, method, uploadParams, context);
    const data = response.data;

    // Method 1: AWS signed multipart upload
    if (data.Cloud_Aws_Bucket_Upload__) {
        return doAwsUpload(fileObj, data, context, options);
    }

    // Method 2: Direct PUT upload
    if (data.PUT) {
        return doPutUpload(fileObj, data, context, options);
    }

    throw new Error('Invalid upload response format: no upload method available');
}

/**
 * Perform a direct PUT upload (simple upload method)
 * @private
 */
async function doPutUpload(file, uploadInfo, context, options) {
    const blockSize = uploadInfo.Blocksize || file.size;
    const blocks = Math.ceil(file.size / blockSize);
    const { onProgress, onError } = options;

    // Upload blocks with concurrency limit
    const maxConcurrent = 3;
    let completedBlocks = 0;

    // Process blocks in batches
    for (let i = 0; i < blocks; i += maxConcurrent) {
        const batch = [];
        for (let j = i; j < Math.min(i + maxConcurrent, blocks); j++) {
            batch.push(
                uploadPutBlockWithRetry(file, uploadInfo, j, blockSize, onError)
                    .then(() => {
                        completedBlocks++;
                        if (onProgress) {
                            onProgress(completedBlocks / blocks);
                        }
                    })
            );
        }

        await Promise.all(batch);
    }

    // All blocks done, call completion with retry support
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const completeResponse = await rest.rest(uploadInfo.Complete, 'POST', {}, context);
            return completeResponse.data;
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'complete', attempt });
                // If onError resolves, retry
                continue;
            }
            throw error;
        }
    }
}

/**
 * Upload a single block via PUT with retry support
 * @private
 */
async function uploadPutBlockWithRetry(file, uploadInfo, blockNum, blockSize, onError) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            return await uploadPutBlock(file, uploadInfo, blockNum, blockSize);
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'upload', blockNum, attempt });
                // If onError resolves, retry
                continue;
            }
            throw error;
        }
    }
}

/**
 * Upload a single block via PUT
 * @private
 */
async function uploadPutBlock(file, uploadInfo, blockNum, blockSize) {
    const startByte = blockNum * blockSize;
    const endByte = Math.min(startByte + blockSize, file.size);

    const arrayBuffer = await readFileSlice(file, startByte, endByte);

    const headers = {
        'Content-Type': file.type || 'application/octet-stream'
    };

    // Add Content-Range for multipart PUT
    const totalBlocks = Math.ceil(file.size / blockSize);
    if (totalBlocks > 1) {
        headers['Content-Range'] = `bytes ${startByte}-${endByte - 1}/*`;
    }

    const response = await utils.fetch(uploadInfo.PUT, {
        method: 'PUT',
        body: arrayBuffer,
        headers: headers
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    await response.text();
}

/**
 * Perform an AWS multipart upload
 * @private
 */
async function doAwsUpload(file, uploadInfo, context, options) {
    const { onProgress, onError } = options;

    // Calculate optimal block size (min 5MB for AWS, target ~10k parts)
    let blockSize = Math.ceil(file.size / 10000);
    if (blockSize < 5242880) blockSize = 5242880;

    const blocks = Math.ceil(file.size / blockSize);

    // Initialize multipart upload with retry support
    let uploadId;
    let initAttempt = 0;
    while (true) {
        initAttempt++;
        try {
            const initResponse = await awsReq(
                uploadInfo,
                'POST',
                'uploads=',
                '',
                { 'Content-Type': file.type || 'application/octet-stream', 'X-Amz-Acl': 'private' },
                context
            );
            const initXml = await initResponse.text();
            const dom = utils.parseXML(initXml);
            uploadId = dom.querySelector('UploadId').innerHTML;
            break;
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'init', attempt: initAttempt });
                continue;
            }
            throw error;
        }
    }

    // Upload all parts with concurrency limit
    const etags = {};
    const maxConcurrent = 3;
    let completedBlocks = 0;

    for (let i = 0; i < blocks; i += maxConcurrent) {
        const batch = [];
        for (let j = i; j < Math.min(i + maxConcurrent, blocks); j++) {
            batch.push(
                uploadAwsBlockWithRetry(file, uploadInfo, uploadId, j, blockSize, context, onError)
                    .then(etag => {
                        etags[j] = etag;
                        completedBlocks++;
                        if (onProgress) {
                            onProgress(completedBlocks / blocks);
                        }
                    })
            );
        }

        await Promise.all(batch);
    }

    // Complete multipart upload with retry support
    let xml = '<CompleteMultipartUpload>';
    for (let i = 0; i < blocks; i++) {
        xml += `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etags[i]}</ETag></Part>`;
    }
    xml += '</CompleteMultipartUpload>';

    let completeAttempt = 0;
    while (true) {
        completeAttempt++;
        try {
            const completeResponse = await awsReq(uploadInfo, 'POST', `uploadId=${uploadId}`, xml, null, context);
            await completeResponse.text();
            break;
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'complete', attempt: completeAttempt });
                continue;
            }
            throw error;
        }
    }

    // Call server-side completion handler with retry support
    let handleAttempt = 0;
    while (true) {
        handleAttempt++;
        try {
            const finalResponse = await rest.rest(
                `Cloud/Aws/Bucket/Upload/${uploadInfo.Cloud_Aws_Bucket_Upload__}:handleComplete`,
                'POST',
                {},
                context
            );
            return finalResponse.data;
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'handleComplete', attempt: handleAttempt });
                continue;
            }
            throw error;
        }
    }
}

/**
 * Upload a single block to AWS S3 with retry support
 * @private
 */
async function uploadAwsBlockWithRetry(file, uploadInfo, uploadId, blockNum, blockSize, context, onError) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            return await uploadAwsBlock(file, uploadInfo, uploadId, blockNum, blockSize, context);
        } catch (error) {
            if (onError) {
                await onError(error, { phase: 'upload', blockNum, attempt });
                continue;
            }
            throw error;
        }
    }
}

/**
 * Upload a single block to AWS S3
 * @private
 */
async function uploadAwsBlock(file, uploadInfo, uploadId, blockNum, blockSize, context) {
    const startByte = blockNum * blockSize;
    const endByte = Math.min(startByte + blockSize, file.size);
    const awsPartNumber = blockNum + 1; // AWS uses 1-based part numbers

    const arrayBuffer = await readFileSlice(file, startByte, endByte);

    const response = await awsReq(
        uploadInfo,
        'PUT',
        `partNumber=${awsPartNumber}&uploadId=${uploadId}`,
        arrayBuffer,
        null,
        context
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const etag = response.headers.get('ETag');
    await response.text();
    return etag;
}

/**
 * Read a slice of a file as ArrayBuffer
 * @private
 */
function readFileSlice(file, start, end) {
    return new Promise((resolve, reject) => {
        // Handle browser File objects
        if (file.browserFile) {
            const slice = file.browserFile.slice(start, end);
            const reader = new FileReader();
            reader.addEventListener('loadend', () => resolve(reader.result));
            reader.addEventListener('error', (e) => reject(e));
            reader.readAsArrayBuffer(slice);
            return;
        }

        if (!file.content) {
            reject(new Error('Cannot read file content - no content property'));
            return;
        }

        const content = file.content;

        if (content instanceof ArrayBuffer) {
            if (start === 0 && end === content.byteLength) {
                resolve(content);
            } else {
                resolve(content.slice(start, end));
            }
        } else if (content.buffer instanceof ArrayBuffer) {
            // TypedArray (Uint8Array, etc.)
            resolve(content.buffer.slice(content.byteOffset + start, content.byteOffset + end));
        } else if (typeof Buffer !== 'undefined' && content instanceof Buffer) {
            // Node.js Buffer
            const arrayBuffer = content.buffer.slice(
                content.byteOffset + start,
                content.byteOffset + Math.min(end, content.byteLength)
            );
            resolve(arrayBuffer);
        } else if (typeof content === 'string') {
            // String content
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(content.slice(start, end));
            resolve(uint8Array.buffer);
        } else {
            reject(new Error('Unsupported content type'));
        }
    });
}

/**
 * AWS S3 request handler
 * Performs a signed request to AWS S3 using a signature obtained from the server
 *
 * @param {Object} upInfo - Upload info including bucket endpoint and key
 * @param {string} method - HTTP method (GET, POST, PUT)
 * @param {string} query - Query parameters
 * @param {*} body - Request body
 * @param {Object} headers - Request headers
 * @param {Object} context - Request context
 * @returns {Promise} - Request promise
 */
function awsReq(upInfo, method, query, body, headers, context) {
    headers = headers || {};
    context = context || {};

    // Calculate body hash for AWS signature
    let bodyHash;
    
    if (!body || body === "") {
        // Empty body hash
        bodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    } else {
        try {
            // Handle different body types
            let bodyForHash = body;
            
            if (body instanceof ArrayBuffer || (body.constructor && body.constructor.name === 'ArrayBuffer')) {
                bodyForHash = new Uint8Array(body);
            } else if (body.constructor && body.constructor.name === 'Buffer') {
                bodyForHash = Buffer.from(body).toString();
            }
            
            bodyHash = sha256(bodyForHash);
        } catch (e) {
            console.error("Error calculating hash:", e.message);
            bodyHash = "UNSIGNED-PAYLOAD";
        }
    }

    // Create AWS timestamp
    const timestamp = utils.getAmzTime();
    const datestamp = timestamp.substring(0, 8);

    // Set AWS headers
    headers["X-Amz-Content-Sha256"] = bodyHash;
    headers["X-Amz-Date"] = timestamp;

    // Prepare the string to sign
    const authStringParts = [
        "AWS4-HMAC-SHA256",
        timestamp,
        `${datestamp}/${upInfo.Bucket_Endpoint.Region}/s3/aws4_request`,
        method,
        `/${upInfo.Bucket_Endpoint.Name}/${upInfo.Key}`,
        query,
        `host:${upInfo.Bucket_Endpoint.Host}`
    ];

    // Add x-* headers to sign
    const headersToSign = ['host'];
    const sortedHeaderKeys = Object.keys(headers).sort();
    
    for (const key of sortedHeaderKeys) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.startsWith('x-')) {
            headersToSign.push(lowerKey);
            authStringParts.push(`${lowerKey}:${headers[key]}`);
        }
    }
    
    // Complete the string to sign
    authStringParts.push('');
    authStringParts.push(headersToSign.join(';'));
    authStringParts.push(bodyHash);

    return new Promise((resolve, reject) => {
        // Get signature from server
        rest.rest(
            `Cloud/Aws/Bucket/Upload/${upInfo.Cloud_Aws_Bucket_Upload__}:signV4`,
            "POST",
            { headers: authStringParts.join("\n") },
            context
        )
        .then(response => {
            // Construct the S3 URL
            let url = `https://${upInfo.Bucket_Endpoint.Host}/${upInfo.Bucket_Endpoint.Name}/${upInfo.Key}`;
            if (query) url += `?${query}`;
            
            // Add the authorization header
            headers["Authorization"] = response.data.authorization;
            
            // Make the actual request to S3
            return utils.fetch(url, {
                method,
                body,
                headers
            });
        })
        .then(resolve)
        .catch(reject);
    });
}

/**
 * Upload module (IIFE pattern)
 * @returns {Object} Upload interface
 */
module.exports.upload = (function () {
    /**
     * Upload state
     */
    const state = {
        queue: [],      // Queued uploads
        failed: [],     // Failed uploads
        running: {},    // Currently processing uploads
        nextId: 0,      // Next upload ID
        lastInput: null // Last created file input element (browser only)
    };
    
    // Public API object
    const upload = {};

    /**
     * Helper Functions
     */
    
    /**
     * Notify progress to listeners
     * Calls onprogress callback and dispatches events
     */
    function sendProgress() {
        const status = upload.getStatus();
        
        // Call the onprogress callback if defined
        if (typeof upload.onprogress === "function") {
            upload.onprogress(status);
        }
        
        // Dispatch event for listeners
        utils.dispatchEvent("upload:progress", status);
    }
    
    /**
     * Handle upload failure
     * @param {Object} up - Upload object
     * @param {*} error - Error data
     */
    function handleFailure(up, error) {
        // Skip if upload is no longer running
        if (!(up.up_id in state.running)) return;
        
        // Check if already in failed list
        for (const failedItem of state.failed) {
            if (failedItem.up_id === up.up_id) {
                return; // Already recorded as failed
            }
        }
        
        // Record failure
        up.failure = error;
        state.failed.push(up);
        delete state.running[up.up_id];
        
        // Continue processing queue
        upload.run();
        
        // Notify progress
        sendProgress();
        
        // Dispatch failure event
        utils.dispatchEvent("upload:failed", {
            item: up,
            res: error
        });
    }
    
    /**
     * Process a pending upload
     * Initiates the upload process with the server
     * @param {Object} up - Upload object
     */
    function processUpload(up) {
        // Mark as processing
        up.status = "pending-wip";
        
        // Prepare parameters
        const params = up.params || {};
        
        // Set file metadata
        params.filename = up.file.name;
        params.size = up.file.size;
        params.lastModified = up.file.lastModified / 1000;
        params.type = up.file.type || "application/octet-stream";
        
        // Initialize upload with the server
        rest.rest(up.path, "POST", params, up.context)
            .then(function(response) {
                // Method 1: AWS signed multipart upload
                if (response.data.Cloud_Aws_Bucket_Upload__) {
                    return handleAwsMultipartUpload(up, response.data);
                }
                
                // Method 2: Direct PUT upload
                if (response.data.PUT) {
                    return handlePutUpload(up, response.data);
                }
                
                // Invalid response format
                delete state.running[up.up_id];
                state.failed.push(up);
                up.reject(new Error('Invalid upload response format'));
            })
            .catch(error => handleFailure(up, error));
    }
    
    /**
     * Set up AWS multipart upload
     * @param {Object} up - Upload object
     * @param {Object} data - Server response data
     */
    function handleAwsMultipartUpload(up, data) {
        // Store upload info
        up.info = data;
        
        // Initialize multipart upload
        return awsReq(
            up.info,
            "POST",
            "uploads=",
            "",
            {"Content-Type": up.file.type || "application/octet-stream", "X-Amz-Acl": "private"},
            up.context
        )
        .then(response => response.text())
        .then(str => utils.parseXML(str))
        .then(dom => dom.querySelector('UploadId').innerHTML)
        .then(uploadId => {
            up.uploadId = uploadId;
            
            // Calculate optimal block size
            const fileSize = up.file.size;
            
            // Target ~10k parts, but minimum 5MB per AWS requirements
            let blockSize = Math.ceil(fileSize / 10000);
            if (blockSize < 5242880) blockSize = 5242880;
            
            // Set up upload parameters
            up.method = 'aws';
            up.bsize = blockSize;
            up.blocks = Math.ceil(fileSize / blockSize);
            up.b = {};
            up.status = 'uploading';
            
            // Continue upload process
            upload.run();
        })
        .catch(error => handleFailure(up, error));
    }
    
    /**
     * Set up direct PUT upload
     * @param {Object} up - Upload object
     * @param {Object} data - Server response data
     */
    function handlePutUpload(up, data) {
        // Store upload info
        up.info = data;
        
        // Calculate block size (if multipart PUT is supported)
        const fileSize = up.file.size;
        let blockSize = fileSize; // Default: single block
        
        if (data.Blocksize) {
            // Server supports multipart upload
            blockSize = data.Blocksize;
        }
        
        // Set up upload parameters
        up.method = 'put';
        up.bsize = blockSize;
        up.blocks = Math.ceil(fileSize / blockSize);
        up.b = {};
        up.status = 'uploading';
        
        // Continue upload process
        upload.run();
    }

    /**
     * Upload a single part of a file
     * Handles both AWS multipart and direct PUT methods
     * @param {Object} up - Upload object
     * @param {number} partNumber - Part number (0-based)
     */
    function uploadPart(up, partNumber) {
        // Mark part as pending
        up.b[partNumber] = "pending";
        
        // Calculate byte range for this part
        const startByte = partNumber * up.bsize;
        const endByte = Math.min(startByte + up.bsize, up.file.size);
        
        // Read file slice as ArrayBuffer
        utils.readAsArrayBuffer(up.file, {
            start: startByte,
            end: endByte
        }, (arrayBuffer, error) => {
            if (error) {
                handleFailure(up, error);
                return;
            }
            
            // Choose upload method based on protocol
            if (up.method === 'aws') {
                uploadAwsPart(up, partNumber, arrayBuffer);
            } else if (up.method === 'put') {
                uploadPutPart(up, partNumber, startByte, arrayBuffer);
            } else {
                handleFailure(up, new Error(`Unknown upload method: ${up.method}`));
            }
        });
    }
    
    /**
     * Upload a part using AWS multipart upload
     * @param {Object} up - Upload object
     * @param {number} partNumber - Part number (0-based)
     * @param {ArrayBuffer} data - Part data
     */
    function uploadAwsPart(up, partNumber, data) {
        // AWS part numbers are 1-based
        const awsPartNumber = partNumber + 1;
        
        awsReq(
            up.info,
            "PUT",
            `partNumber=${awsPartNumber}&uploadId=${up.uploadId}`,
            data,
            null,
            up.context
        )
        .then(response => {
            // Verify the response is successful
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            // Store ETag for this part (needed for completion)
            const etag = response.headers.get("ETag");
            // Read response body to ensure request completed
            return response.text().then(() => etag);
        })
        .then(etag => {
            up.b[partNumber] = etag;

            // Update progress and continue processing
            sendProgress();
            upload.run();
        })
        .catch(error => handleFailure(up, error));
    }
    
    /**
     * Upload a part using direct PUT
     * @param {Object} up - Upload object
     * @param {number} partNumber - Part number (0-based)
     * @param {number} startByte - Starting byte position
     * @param {ArrayBuffer} data - Part data
     */
    function uploadPutPart(up, partNumber, startByte, data) {
        // Set up headers
        const headers = {
            "Content-Type": up.file.type || "application/octet-stream"
        };
        
        // Add Content-Range header for multipart PUT
        if (up.blocks > 1) {
            const endByte = startByte + data.byteLength - 1; // inclusive
            headers["Content-Range"] = `bytes ${startByte}-${endByte}/*`;
        }

        // Perform the PUT request
        utils.fetch(up.info.PUT, {
            method: "PUT",
            body: data,
            headers: headers,
        })
        .then(response => {
            // Verify the response is successful
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            // Read response body to ensure request completed
            return response.text();
        })
        .then(() => {
            // Mark part as done
            up.b[partNumber] = "done";

            // Update progress and continue processing
            sendProgress();
            upload.run();
        })
        .catch(error => handleFailure(up, error));
    }

    /**
     * Process an upload in progress
     * Manages uploading parts and completing the upload
     * @param {Object} up - Upload object
     */
    function processActiveUpload(up) {
        // Skip if paused or canceled
        if (up.paused || up.canceled) return;

        // Track upload progress
        let pendingParts = 0;
        let completedParts = 0;
        
        // Process each part
        for (let i = 0; i < up.blocks; i++) {
            if (up.b[i] === undefined) {
                // Part not started yet
                if (up.paused) break; // Don't start new parts when paused
                
                // Start uploading this part
                uploadPart(up, i);
                pendingParts++;
            } else if (up.b[i] !== "pending") {
                // Part completed
                completedParts++;
                continue;
            } else {
                // Part in progress
                pendingParts++;
            }
            
            // Limit concurrent uploads
            if (pendingParts >= 3) break;
        }

        // Update upload progress
        up.done = completedParts;

        // Check if all parts are complete
        if (pendingParts === 0 && completedParts === up.blocks) {
            // All parts complete, finalize the upload
            up.status = "validating";
            
            if (up.method === 'aws') {
                completeAwsUpload(up);
            } else if (up.method === 'put') {
                completePutUpload(up);
            }
        }
    }
    
    /**
     * Complete AWS multipart upload
     * @param {Object} up - Upload object
     */
    function completeAwsUpload(up) {
        // Create completion XML
        // See: https://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
        let xml = "<CompleteMultipartUpload>";
        
        for (let i = 0; i < up.blocks; i++) {
            // AWS part numbers are 1-based
            xml += `<Part><PartNumber>${i + 1}</PartNumber><ETag>${up.b[i]}</ETag></Part>`;
        }
        
        xml += "</CompleteMultipartUpload>";
        
        // Send completion request
        awsReq(up.info, "POST", `uploadId=${up.uploadId}`, xml, null, up.context)
            .then(response => response.text())
            .then(() => {
                // Call server-side completion handler
                return rest.rest(
                    `Cloud/Aws/Bucket/Upload/${up.info.Cloud_Aws_Bucket_Upload__}:handleComplete`,
                    "POST",
                    {},
                    up.context
                );
            })
            .then(response => {
                // Mark upload as complete
                up.status = "complete";
                up.final = response.data;
                
                // Notify listeners
                sendProgress();
                
                // Remove from running uploads
                delete state.running[up.up_id];
                
                // Resolve the upload promise
                up.resolve(up);
                
                // Continue processing queue
                upload.run();
            })
            .catch(error => handleFailure(up, error));
    }
    
    /**
     * Complete direct PUT upload
     * @param {Object} up - Upload object
     */
    function completePutUpload(up) {
        // Call completion endpoint
        rest.rest(up.info.Complete, "POST", {}, up.context)
            .then(response => {
                // Mark upload as complete
                up.status = "complete";
                up.final = response.data;
                
                // Notify listeners
                sendProgress();
                
                // Remove from running uploads
                delete state.running[up.up_id];
                
                // Resolve the upload promise
                up.resolve(up);
                
                // Continue processing queue
                upload.run();
            })
            .catch(error => handleFailure(up, error));
    }

    /**
     * Fill the upload queue with new upload tasks
     * Takes items from the queue and adds them to running uploads
     */
    function fillUploadQueue() {
        // Skip if we're already running the maximum number of uploads
        if (Object.keys(state.running).length >= 3) return;
        
        // Maximum of 3 concurrent uploads
        while (Object.keys(state.running).length < 3 && state.queue.length > 0) {
            // Get next upload from queue
            const upload = state.queue.shift();
            
            // Add to running uploads
            state.running[upload.up_id] = upload;
        }
        
        // Notify progress
        sendProgress();
    }
    
    /**
     * Get current upload status
     * @returns {Object} Status object with queued, running and failed uploads
     */
    upload.getStatus = function() {
        return {
            queue: state.queue,
            running: Object.keys(state.running).map(id => state.running[id]),
            failed: state.failed
        };
    };
    
    /**
     * Resume all failed uploads
     * Moves failed uploads back to the queue
     */
    upload.resume = function() {
        // Move all failed uploads back to the queue
        while (state.failed.length > 0) {
            state.queue.push(state.failed.shift());
        }
        
        // Restart upload process
        upload.run();
    };

    /**
     * Initialize uploads in different environments
     * 
     * @param {string} path - API path to upload to
     * @param {Object} params - Upload parameters
     * @param {Function} notify - Notification callback
     * @returns {Function} - Function to start uploads
     */
    upload.init = function(path, params, notify) {
        params = params || {};
        
        if (env.isBrowser) {
            // Browser implementation
            if (state.lastInput !== null) {
                state.lastInput.parentNode.removeChild(state.lastInput);
                state.lastInput = null;
            }

            const input = document.createElement("input");
            input.type = "file";
            input.style.display = "none";
            if (!params.single) {
                input.multiple = "multiple";
            }

            document.getElementsByTagName('body')[0].appendChild(input);
            state.lastInput = input;

            const promise = new Promise(function(resolve, reject) {
                input.onchange = function() {
                    if (this.files.length === 0) {
                        return resolve();
                    }

                    let count = this.files.length;
                    if (notify) notify({status: 'init', count: count});
                    
                    for (let i = 0; i < this.files.length; i++) {
                        upload.append(path, this.files[i], params, fwWrapper.getContext())
                            .then(function(obj) {
                                count -= 1;
                                if (notify) notify(obj);
                                if (count === 0) resolve();
                            });
                    }
                    upload.run();
                };
            });

            input.click();
            return promise;
        } else {
            // Non-browser environment
            return function(files) {
                // Allow array, single file object, or file content buffer
                if (!Array.isArray(files)) {
                    if (files instanceof ArrayBuffer || 
                        (files.buffer instanceof ArrayBuffer) || 
                        (typeof Buffer !== 'undefined' && files instanceof Buffer)) {
                        // If it's a buffer/ArrayBuffer, create a file-like object
                        files = [{
                            name: params.filename || 'file.bin',
                            size: files.byteLength || files.length,
                            type: params.type || 'application/octet-stream',
                            lastModified: Date.now(),
                            content: files
                        }];
                    } else {
                        // Single file object
                        files = [files];
                    }
                }
                
                return new Promise(function(resolve, reject) {
                    const count = files.length;
                    if (count === 0) {
                        return resolve();
                    }
                    
                    if (notify) notify({status: 'init', count: count});
                    
                    let remainingCount = count;
                    
                    files.forEach(file => {
                        try {
                            // Ensure file has required properties
                            if (!file.name) file.name = 'file.bin';
                            if (!file.type) file.type = 'application/octet-stream';
                            if (!file.lastModified) file.lastModified = Date.now();
                            
                            // Add slice method if not present
                            if (!file.slice && file.content) {
                                file.slice = function(start, end) {
                                    return {
                                        content: this.content.slice(start, end || this.size)
                                    };
                                };
                            }
                            
                            upload.append(path, file, params, fwWrapper.getContext())
                                .then(function(obj) {
                                    remainingCount -= 1;
                                    if (notify) notify(obj);
                                    if (remainingCount === 0) resolve();
                                })
                                .catch(function(err) {
                                    remainingCount -= 1;
                                    console.error('Error uploading file:', err);
                                    if (remainingCount === 0) resolve();
                                });
                        } catch (err) {
                            remainingCount -= 1;
                            console.error('Error processing file:', err);
                            if (remainingCount === 0) resolve();
                        }
                    });
                    
                    upload.run();
                });
            };
        }
    };

    /**
     * Add a file to the upload queue
     * @param {string} path - API path to upload to
     * @param {File|Object} file - File to upload
     * @param {Object} params - Upload parameters
     * @param {Object} context - Request context
     * @returns {Promise} - Upload promise
     */
    upload.append = function(path, file, params, context) {
        return new Promise((resolve, reject) => {
            // Process parameters
            params = params || {};
            context = context || fwWrapper.getContext();
            
            // Create an upload object
            const uploadObject = {
                path: path,
                file: file,
                resolve: resolve,
                reject: reject,
                status: "pending",
                paused: false,
                up_id: state.nextId++,
                params: params,
                context: { ...context }  // Create a copy to avoid modification
            };
            
            // Add to queue
            state.queue.push(uploadObject);
        });
    };

    /**
     * Cancel an upload in progress or in queue
     * @param {number} uploadId - Upload ID to cancel
     */
    upload.cancelItem = function(uploadId) {
        // Check running uploads
        if (state.running[uploadId]) {
            // Mark running upload as canceled
            state.running[uploadId].canceled = true;
        } else {
            // Check queued uploads
            for (let i = 0; i < state.queue.length; i++) {
                if (state.queue[i].up_id === uploadId) {
                    state.queue[i].canceled = true;
                    break;
                }
            }
        }
        
        // Update progress
        sendProgress();
    };
    
    /**
     * Delete an upload from queue or failed list
     * Only canceled uploads can be removed from running list
     * @param {number} uploadId - Upload ID to delete
     */
    upload.deleteItem = function(uploadId) {
        // Check running uploads
        if (state.running[uploadId]) {
            // Only delete if canceled
            if (state.running[uploadId].canceled) {
                delete state.running[uploadId];
            }
        } else {
            // Check queue
            for (let i = 0; i < state.queue.length; i++) {
                if (state.queue[i].up_id === uploadId) {
                    state.queue.splice(i, 1);
                    break;
                }
            }
            
            // Check failed uploads
            for (let i = 0; i < state.failed.length; i++) {
                if (state.failed[i].up_id === uploadId) {
                    state.failed.splice(i, 1);
                    break;
                }
            }
        }
        
        // Update progress
        sendProgress();
    };
    
    /**
     * Pause an active upload
     * @param {number} uploadId - Upload ID to pause
     */
    upload.pauseItem = function(uploadId) {
        // Find upload in running list
        const upload = state.running[uploadId];
        
        // Only pause if active
        if (upload && upload.status === "uploading") {
            upload.paused = true;
        }
        
        // Update progress
        sendProgress();
    };
    
    /**
     * Resume a paused upload
     * @param {number} uploadId - Upload ID to resume
     */
    upload.resumeItem = function(uploadId) {
        // Find upload in running list
        const upload = state.running[uploadId];
        
        // Only resume if paused
        if (upload && upload.paused) {
            upload.paused = false;
            processActiveUpload(upload);
        }
        
        // Update progress
        sendProgress();
    };
    
    /**
     * Retry a failed upload
     * @param {number} uploadId - Upload ID to retry
     */
    upload.retryItem = function(uploadId) {
        // Find upload in failed list
        let failedUpload = null;
        let failedIndex = -1;
        
        for (let i = 0; i < state.failed.length; i++) {
            if (state.failed[i].up_id === uploadId) {
                failedUpload = state.failed[i];
                failedIndex = i;
                break;
            }
        }
        
        // Skip if not found
        if (!failedUpload) return;
        
        // Check if already in queue
        for (let i = 0; i < state.queue.length; i++) {
            if (state.queue[i].up_id === uploadId) {
                return; // Already in queue
            }
        }
        
        // Reset failure data
        failedUpload.failure = {};
        
        // Reset pending parts
        for (let i = 0; i < failedUpload.blocks; i++) {
            if (failedUpload.b[i] === "pending") {
                failedUpload.b[i] = undefined;
            }
        }
        
        // Move from failed to queue
        state.failed.splice(failedIndex, 1);
        state.queue.push(failedUpload);
        
        // Restart upload
        upload.run();
        
        // Dispatch retry event
        utils.dispatchEvent("upload:retry", { item: failedUpload });
        
        // Update progress
        sendProgress();
    };

    /**
     * Start or continue the upload process
     * Processes queued uploads and continues running uploads
     */
    upload.run = function() {
        // Fill queue with new uploads
        fillUploadQueue();
        
        // Process running uploads
        for (const uploadId in state.running) {
            const upload = state.running[uploadId];
            
            // Process based on status
            switch (upload.status) {
                case "pending":
                    processUpload(upload);
                    break;
                case "uploading":
                    processActiveUpload(upload);
                    break;
            }
        }
    };

    return upload;
}());

// Export simple upload function for Node.js consumers
module.exports.uploadFile = uploadFile;