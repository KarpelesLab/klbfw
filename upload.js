/**
 * KLB Upload Module
 *
 * This module provides the uploadFile function for uploading files to KLB API endpoints.
 * It supports both browser and Node.js environments with a unified API.
 *
 * @module upload
 */

'use strict';

const rest = require('./rest');
const fwWrapper = require('./fw-wrapper');
const { env, utils, awsReq, readChunkFromStream, readFileSlice } = require('./upload-internal');

/**
 * Simple file upload function
 *
 * This function provides a straightforward way to upload a file and get a Promise
 * that resolves when the upload is complete.
 *
 * @param {string} api - API endpoint path (e.g., 'Misc/Debug:testUpload')
 * @param {Buffer|ArrayBuffer|Uint8Array|File|Object} buffer - File to upload. Can be:
 *   - A Node.js Buffer
 *   - An ArrayBuffer
 *   - A Uint8Array or other TypedArray
 *   - A browser File object
 *   - A file-like object with { name, size, type, content, lastModified }
 *   - A file-like object with { name, size, type, stream } for streaming large files
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
 * @returns {Promise<Object>} - Resolves with the full REST response
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
 *
 * @example
 * // Upload a large file using a stream (Node.js) - doesn't load entire file into memory
 * const fs = require('fs');
 * const stream = fs.createReadStream('/path/to/large-file.bin');
 * const result = await uploadFile('Misc/Debug:testUpload', stream, 'POST', {
 *   filename: 'large-file.bin',
 *   type: 'application/octet-stream',
 *   size: 2199023255552  // optional: if known, enables optimal block sizing
 * });
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
            lastModified: Date.now() / 1000,
            content: uint8Array.buffer
        };
    }
    // Handle ArrayBuffer
    else if (buffer instanceof ArrayBuffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.byteLength,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now() / 1000,
            content: buffer
        };
    }
    // Handle TypedArray (Uint8Array, etc.)
    else if (buffer && buffer.buffer instanceof ArrayBuffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.byteLength,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now() / 1000,
            content: buffer
        };
    }
    // Handle Node.js Buffer
    else if (typeof Buffer !== 'undefined' && buffer instanceof Buffer) {
        fileObj = {
            name: params.filename || 'file.bin',
            size: buffer.length,
            type: params.type || 'application/octet-stream',
            lastModified: Date.now() / 1000,
            content: buffer
        };
    }
    // Handle browser File object
    else if (env.isBrowser && typeof File !== 'undefined' && buffer instanceof File) {
        fileObj = {
            name: params.filename || buffer.name || 'file.bin',
            size: buffer.size,
            type: params.type || buffer.type || 'application/octet-stream',
            lastModified: (buffer.lastModified || Date.now()) / 1000,
            browserFile: buffer  // Keep reference to original File for reading
        };
    }
    // Handle file-like object with content property
    else if (buffer && buffer.content !== undefined) {
        fileObj = {
            name: params.filename || buffer.name || 'file.bin',
            size: buffer.size || buffer.content.byteLength || buffer.content.length,
            type: params.type || buffer.type || 'application/octet-stream',
            lastModified: (buffer.lastModified || Date.now()) / 1000,
            content: buffer.content
        };
    }
    // Handle Node.js readable stream
    else if (buffer && typeof buffer.read === 'function' && typeof buffer.on === 'function') {
        fileObj = {
            name: params.filename || 'file.bin',
            size: params.size || null,  // null means unknown size
            type: params.type || 'application/octet-stream',
            lastModified: Date.now() / 1000,
            stream: buffer
        };
    }
    else {
        throw new Error('Invalid file: must be a Buffer, ArrayBuffer, Uint8Array, File, readable stream, or file-like object with content');
    }

    // Merge params with file metadata (file metadata takes precedence for these fields)
    const uploadParams = { ...params };
    uploadParams.filename = fileObj.name;
    uploadParams.size = fileObj.size;
    uploadParams.lastModified = fileObj.lastModified;
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
    const { onProgress, onError } = options;

    // Calculate block size
    // - If size known: use server's Blocksize or file size
    // - If size unknown (streaming): use 526MB default
    let blockSize;
    let blocks = null;

    if (file.size) {
        blockSize = uploadInfo.Blocksize || file.size;
        blocks = Math.ceil(file.size / blockSize);
    } else {
        blockSize = 551550976;  // 526MB
    }

    const maxConcurrent = 3;
    let completedBlocks = 0;

    // Stream-based upload: read sequentially, upload in parallel
    if (file.stream) {
        let blockNum = 0;
        let streamEnded = false;
        let byteOffset = 0;
        const pendingUploads = [];

        while (!streamEnded || pendingUploads.length > 0) {
            // Read and start uploads up to maxConcurrent
            while (!streamEnded && pendingUploads.length < maxConcurrent) {
                const chunkData = await readChunkFromStream(file.stream, blockSize);
                if (chunkData === null) {
                    streamEnded = true;
                    break;
                }

                const currentBlock = blockNum++;
                const startByte = byteOffset;
                byteOffset += chunkData.byteLength;

                // Only add Content-Range for multi-block uploads
                const useContentRange = blocks === null || blocks > 1;
                const uploadPromise = uploadPutBlockWithDataAndRetry(
                    uploadInfo, currentBlock, startByte, chunkData, file.type, onError, useContentRange
                ).then(() => {
                    completedBlocks++;
                    if (onProgress && blocks) {
                        onProgress(completedBlocks / blocks);
                    }
                });

                pendingUploads.push(uploadPromise);
            }

            // Wait for at least one upload to complete before reading more
            if (pendingUploads.length > 0) {
                // Create indexed promises that return their index when done
                const indexedPromises = pendingUploads.map((p, idx) => p.then(() => idx));
                const completedIdx = await Promise.race(indexedPromises);
                pendingUploads.splice(completedIdx, 1);
            }
        }

        blocks = blockNum;
    } else {
        // Buffer-based upload: original logic
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
    }

    // All blocks done, call completion with retry support
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const completeResponse = await rest.rest(uploadInfo.Complete, 'POST', {}, context);
            return completeResponse;
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
 * Upload a single block via PUT with pre-read data and retry support
 * @private
 */
async function uploadPutBlockWithDataAndRetry(uploadInfo, blockNum, startByte, data, contentType, onError, useContentRange) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const headers = {
                'Content-Type': contentType || 'application/octet-stream'
            };

            // Add Content-Range for multipart PUT (not for single-block uploads)
            if (useContentRange) {
                headers['Content-Range'] = `bytes ${startByte}-${startByte + data.byteLength - 1}/*`;
            }

            const response = await utils.fetch(uploadInfo.PUT, {
                method: 'PUT',
                body: data,
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            await response.text();
            return;
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

    // Calculate block size
    // - If size known: target ~10k parts, min 5MB
    // - If size unknown: use 526MB (allows up to ~5TB with 10k parts)
    let blockSize;
    let blocks = null;  // null means unknown (streaming)

    if (file.size) {
        blockSize = Math.ceil(file.size / 10000);
        if (blockSize < 5242880) blockSize = 5242880;
        blocks = Math.ceil(file.size / blockSize);
    } else {
        blockSize = 551550976;  // 526MB
    }

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

    const etags = {};
    const maxConcurrent = 3;
    let completedBlocks = 0;

    // Stream-based upload: read sequentially, upload in parallel
    if (file.stream) {
        let blockNum = 0;
        let streamEnded = false;
        const pendingUploads = [];

        while (!streamEnded || pendingUploads.length > 0) {
            // Read and start uploads up to maxConcurrent
            while (!streamEnded && pendingUploads.length < maxConcurrent) {
                const chunkData = await readChunkFromStream(file.stream, blockSize);
                if (chunkData === null) {
                    streamEnded = true;
                    break;
                }

                const currentBlock = blockNum++;
                const uploadPromise = uploadAwsBlockWithDataAndRetry(
                    uploadInfo, uploadId, currentBlock, chunkData, context, onError
                ).then(etag => {
                    etags[currentBlock] = etag;
                    completedBlocks++;
                    if (onProgress && blocks) {
                        onProgress(completedBlocks / blocks);
                    }
                });

                pendingUploads.push(uploadPromise);
            }

            // Wait for at least one upload to complete before reading more
            if (pendingUploads.length > 0) {
                // Create indexed promises that return their index when done
                const indexedPromises = pendingUploads.map((p, idx) => p.then(() => idx));
                const completedIdx = await Promise.race(indexedPromises);
                pendingUploads.splice(completedIdx, 1);
            }
        }

        blocks = blockNum;  // Now we know the total
    } else {
        // Buffer-based upload: original logic
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
            return finalResponse;
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
 * Upload a block to AWS S3 with pre-read data and retry support
 * @private
 */
async function uploadAwsBlockWithDataAndRetry(uploadInfo, uploadId, blockNum, data, context, onError) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const awsPartNumber = blockNum + 1;
            const response = await awsReq(
                uploadInfo,
                'PUT',
                `partNumber=${awsPartNumber}&uploadId=${uploadId}`,
                data,
                null,
                context
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const etag = response.headers.get('ETag');
            await response.text();
            return etag;
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

// Export
module.exports.uploadFile = uploadFile;
