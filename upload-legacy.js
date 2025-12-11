/**
 * KLB Upload Legacy Module
 *
 * This module provides the deprecated upload object for backwards compatibility.
 * New code should use uploadFile() or uploadManyFiles() instead.
 *
 * @module upload-legacy
 * @deprecated Use uploadFile() or uploadManyFiles() instead
 */

'use strict';

const rest = require('./rest');
const fwWrapper = require('./fw-wrapper');
const { env, utils, awsReq } = require('./upload-internal');

/**
 * Upload module (IIFE pattern)
 * @deprecated Use uploadFile() or uploadManyFiles() instead
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

        // Reject the promise so callers know the upload failed
        if (up.reject) {
            up.reject(error);
        }

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
