/**
 * KLB Upload Many Module
 *
 * This module provides the uploadManyFiles function for batch uploading files.
 *
 * @module upload-many
 */

'use strict';

const { uploadFile } = require('./upload');

/**
 * Upload multiple files with concurrency control
 *
 * This function uploads an array of files to the same API endpoint, with up to 3
 * concurrent uploads at a time. It provides progress information for both individual
 * files and overall progress.
 *
 * @param {string} api - API endpoint path (e.g., 'Misc/Debug:testUpload')
 * @param {Array} files - Array of files to upload. Each element can be:
 *   - A browser File object
 *   - A Node.js Buffer
 *   - An ArrayBuffer or Uint8Array
 *   - A file-like object with { name, size, type, content }
 *   - A string (will be converted to UTF-8 bytes)
 * @param {string} [method='POST'] - HTTP method for the initial API call
 * @param {Object} [params={}] - Additional parameters to send with each upload.
 *   Note: filename, size, type, lastModified are set per-file automatically.
 * @param {Object} [context=null] - Request context (uses default context if not provided)
 * @param {Object} [options={}] - Upload options
 * @param {Function} [options.onProgress] - Progress callback({ fileIndex, fileCount, fileProgress, totalProgress })
 *   - fileIndex: Current file index (0-based)
 *   - fileCount: Total number of files
 *   - fileProgress: Progress of current file (0-1)
 *   - totalProgress: Overall progress (0-1)
 * @param {Function} [options.onFileComplete] - Called when each file completes({ fileIndex, fileCount, result })
 * @param {Function} [options.onError] - Error callback(error, context). Can return a Promise
 *   that, if resolved, will cause the failed operation to be retried.
 *   Context includes { fileIndex, phase, attempt } where phase is 'file' for file-level errors,
 *   or 'upload'/'init'/'complete' for block-level errors (also includes blockNum for 'upload').
 * @param {number} [options.concurrency=3] - Maximum concurrent uploads (1-10)
 * @returns {Promise<Array>} - Resolves with array of upload results in same order as input files
 *
 * @example
 * // Upload multiple files from a file input
 * const files = document.querySelector('input[type="file"]').files;
 * const results = await uploadManyFiles('Misc/Debug:testUpload', Array.from(files), 'POST', {
 *   image_variation: 'alias=thumb&scale_crop=200x200'
 * }, null, {
 *   onProgress: ({ fileIndex, fileCount, totalProgress }) => {
 *     console.log(`File ${fileIndex + 1}/${fileCount}, Total: ${Math.round(totalProgress * 100)}%`);
 *   },
 *   onFileComplete: ({ fileIndex, fileCount, result }) => {
 *     console.log(`File ${fileIndex + 1}/${fileCount} complete:`, result);
 *   }
 * });
 *
 * @example
 * // Upload buffers with custom concurrency
 * const buffers = [buffer1, buffer2, buffer3, buffer4, buffer5];
 * const results = await uploadManyFiles('Misc/Debug:testUpload', buffers, 'POST', {}, null, {
 *   concurrency: 5,
 *   onProgress: ({ totalProgress }) => console.log(`${Math.round(totalProgress * 100)}%`)
 * });
 */
async function uploadManyFiles(api, files, method, params, context, options) {
    // Handle default values
    method = method || 'POST';
    params = params || {};
    options = options || {};

    const fileCount = files.length;
    if (fileCount === 0) {
        return [];
    }

    const concurrency = Math.min(Math.max(options.concurrency || 3, 1), 10);
    const { onProgress, onFileComplete, onError } = options;

    // Results array in same order as input
    const results = new Array(fileCount);

    // Track progress for each file (0-1)
    const fileProgressArray = new Array(fileCount).fill(0);

    // Queue of file indices to process
    let nextIndex = 0;

    // Currently running uploads
    const running = new Set();

    // Helper to calculate and report progress
    const reportProgress = (fileIndex, fileProgress) => {
        fileProgressArray[fileIndex] = fileProgress;

        if (onProgress) {
            // Calculate total progress as average of all file progress
            const totalProgress = fileProgressArray.reduce((sum, p) => sum + p, 0) / fileCount;

            onProgress({
                fileIndex,
                fileCount,
                fileProgress,
                totalProgress
            });
        }
    };

    // Upload a single file and return its result (with retry support)
    const uploadOne = async (fileIndex) => {
        const file = files[fileIndex];
        let attempt = 0;

        while (true) {
            attempt++;

            // Create per-file options with wrapped callbacks
            const fileOptions = {
                onProgress: (progress) => {
                    reportProgress(fileIndex, progress);
                }
            };

            // Wrap onError to include fileIndex for block-level errors
            if (onError) {
                fileOptions.onError = (error, ctx) => {
                    return onError(error, { ...ctx, fileIndex });
                };
            }

            try {
                const result = await uploadFile(api, file, method, { ...params }, context, fileOptions);

                // Mark as complete
                fileProgressArray[fileIndex] = 1;
                results[fileIndex] = result;

                if (onFileComplete) {
                    onFileComplete({ fileIndex, fileCount, result });
                }

                return result;
            } catch (error) {
                // Give onError a chance to retry the whole file
                if (onError) {
                    try {
                        await onError(error, { fileIndex, phase: 'file', attempt });
                        // Reset progress for retry
                        fileProgressArray[fileIndex] = 0;
                        continue; // Retry
                    } catch (e) {
                        // onError rejected, don't retry
                    }
                }

                // Store error in results and give up
                results[fileIndex] = { error };
                throw error;
            }
        }
    };

    // Process files with concurrency limit
    const processQueue = async () => {
        const workers = [];

        for (let i = 0; i < concurrency; i++) {
            workers.push((async () => {
                while (nextIndex < fileCount) {
                    const fileIndex = nextIndex++;
                    running.add(fileIndex);

                    try {
                        await uploadOne(fileIndex);
                    } catch (error) {
                        // Continue with next file even if one fails
                        // Error is already stored in results
                    } finally {
                        running.delete(fileIndex);
                    }
                }
            })());
        }

        await Promise.all(workers);
    };

    await processQueue();

    // Check if any uploads failed
    const errors = results.filter(r => r && r.error).map(r => r.error);
    if (errors.length > 0) {
        const error = new Error(`${errors.length} of ${fileCount} uploads failed`);
        error.errors = errors;
        error.results = results;
        throw error;
    }

    return results;
}

// Export
module.exports.uploadManyFiles = uploadManyFiles;
