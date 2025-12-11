/**
 * KLB Upload Internal Module
 *
 * Shared utilities for upload modules.
 * This module is not meant to be used directly.
 *
 * @module upload-internal
 * @private
 */

'use strict';

const rest = require('./rest');
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
 * Read a chunk of specified size from a stream
 * @param {ReadableStream} stream - Node.js readable stream
 * @param {number} size - Number of bytes to read
 * @returns {Promise<ArrayBuffer|null>} - ArrayBuffer with data, or null if stream ended
 */
function readChunkFromStream(stream, size) {
    return new Promise((resolve, reject) => {
        // Check if stream already ended before we start
        if (stream.readableEnded) {
            resolve(null);
            return;
        }

        const chunks = [];
        let bytesRead = 0;
        let resolved = false;

        const doResolve = (value) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(value);
        };

        const onReadable = () => {
            if (resolved) return;

            let chunk;
            while (bytesRead < size && (chunk = stream.read(Math.min(size - bytesRead, 65536))) !== null) {
                chunks.push(chunk);
                bytesRead += chunk.length;
            }

            if (bytesRead >= size) {
                doResolve(combineChunks(chunks));
            } else if (stream.readableEnded) {
                // Stream already ended, resolve with what we have
                if (bytesRead === 0) {
                    doResolve(null);
                } else {
                    doResolve(combineChunks(chunks));
                }
            }
        };

        const onEnd = () => {
            if (resolved) return;
            if (bytesRead === 0) {
                doResolve(null);  // Stream ended, no more data
            } else {
                doResolve(combineChunks(chunks));
            }
        };

        const onError = (err) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(err);
        };

        const cleanup = () => {
            stream.removeListener('readable', onReadable);
            stream.removeListener('end', onEnd);
            stream.removeListener('error', onError);
        };

        stream.on('readable', onReadable);
        stream.on('end', onEnd);
        stream.on('error', onError);

        // Try reading immediately in case data is already buffered
        onReadable();
    });
}

/**
 * Combine chunks into a single ArrayBuffer
 * @private
 */
function combineChunks(chunks) {
    if (chunks.length === 0) {
        return new ArrayBuffer(0);
    }
    if (chunks.length === 1) {
        const chunk = chunks[0];
        return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length);
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length), offset);
        offset += chunk.length;
    }
    return result.buffer;
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

// Exports
module.exports.env = env;
module.exports.utils = utils;
module.exports.awsReq = awsReq;
module.exports.readChunkFromStream = readChunkFromStream;
module.exports.combineChunks = combineChunks;
module.exports.readFileSlice = readFileSlice;
