# klbfw

Karpeles Lab Frontend Framework - A JavaScript library for communicating with KLB API.

This library provides a unified interface for interacting with KLB API services from both browser and Node.js environments.

## Features

- **Cross-environment compatibility**: Works in both browser and Node.js environments
- **REST API client**: Simple and consistent interface for API requests
- **File upload**: Supports file uploads in any environment with both direct PUT and AWS S3 multipart protocols
- **Context handling**: Manages authentication, locale, and other contextual information
- **Cookie management**: Cross-platform cookie handling that works in SSR mode
- **Internationalization**: Easy access to i18n data

## Installation

```bash
npm install @karpeleslab/klbfw
```

For Node.js environments with file upload support, install optional dependencies:

```bash
npm install @karpeleslab/klbfw node-fetch @xmldom/xmldom
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests (requires KLB API server)
npm run test:integration
```

## Version 0.2.0 Changes

- **Modern JavaScript**: Refactored to use ES6+ features (arrow functions, const/let, template literals)
- **Improved Documentation**: Added comprehensive JSDoc comments for all modules and functions
- **Better Code Organization**: Restructured code for improved readability and maintainability
- **Cross-Platform Support**: Enhanced environment detection and compatibility
- **Standardized Naming**: Consistent use of camelCase with backward compatibility for legacy APIs
- **Enhanced Error Handling**: More robust error handling and reporting

## Migrating from upload.append() to uploadFile()

The new `uploadFile()` function provides a simpler Promise-based API for file uploads. Here are the key differences when migrating:

### Return Value

**Legacy `upload.append()`** resolves with an upload object containing the result in `.final`:
```javascript
upload.append('Misc/Debug:testUpload', file)
  .then(result => {
    console.log(result.final);  // The completion response data
  });
```

**New `uploadFile()`** resolves with the full REST response:
```javascript
uploadFile('Misc/Debug:testUpload', buffer)
  .then(response => {
    console.log(response.data);  // The completion response data
  });
```

### Migration Example

Before:
```javascript
upload.append('Misc/Debug:testUpload', file, params, context)
  .then(up => {
    const data = up.final;
    // use data
  });
```

After:
```javascript
uploadFile('Misc/Debug:testUpload', file, 'POST', params, context)
  .then(response => {
    const data = response.data;
    // use data
  });
```

# API

## REST API Methods

### rest(api, method, params, context)

Performs a REST query and returns a promise to the response.

### rest_get(name, params) / restGet(name, params)

Simplified version of rest() that uses HTTP GET. Takes a REST API endpoint name and optional parameters, returning a Promise with the response.

Note: Starting from version 0.2.0, camelCase method names are also available (e.g., `restGet` instead of `rest_get`).

### upload

The upload module provides cross-platform file upload capabilities, supporting both browser and Node.js environments.

#### Browser Usage

```javascript
// Open file picker and upload selected files
upload.init('Misc/Debug:testUpload')()
  .then(result => console.log('Upload complete', result));

// Open file picker with custom parameters and notification callback
upload.init('Support/Ticket:upload', {image_variation: 'alias=mini&strip&scale_crop=300x200'}, (result) => {
  if (result.status == 'complete') console.log(result.final);
});

// Upload a specific File object
upload.append('Misc/Debug:testUpload', fileObject)
  .then(result => console.log('Upload complete', result));

// Track progress
upload.onprogress = (status) => {
  console.log('Progress:', status.running.map(i => i.status));
};

// Cancel an upload
upload.cancelItem(uploadId);
```

#### Node.js Usage

```javascript
// For Node.js environments, first install dependencies:
// npm install node-fetch @xmldom/xmldom

// Initialize upload with specific file paths
upload.init('Misc/Debug:testUpload')(['./file1.txt', './file2.jpg'])
  .then(result => console.log('Upload complete', result));

// Or create a custom file object with path
const file = {
  name: 'test.txt',
  size: 1024,
  type: 'text/plain',
  path: '/path/to/file.txt'
};
upload.append('Misc/Debug:testUpload', file)
  .then(result => console.log('Upload complete', result));
```

#### Upload Management

The upload module provides methods to manage active uploads:

- `upload.getStatus()`: Get current upload status (queue, running, failed)
- `upload.cancelItem(uploadId)`: Cancel an upload
- `upload.pauseItem(uploadId)`: Pause an active upload
- `upload.resumeItem(uploadId)`: Resume a paused upload
- `upload.retryItem(uploadId)`: Retry a failed upload
- `upload.deleteItem(uploadId)`: Remove an upload from the queue or failed list

## Query Parameter Methods

### GET

Object containing all URL query parameters parsed from the request.

### Get(key)

Retrieves a specific query parameter value by key. If no key is provided, returns the entire GET object.

### flushGet()

Clears the GET parameters by resetting the internal GET object to an empty object.

## URL and Path Methods

### getPrefix()

Returns the language/etc prefix part of the URL, for example `/l/en-US`. The prefix should be inserted before the path in the URL.

### getUrl()

Returns the active URL.

### getPath()

Returns the non-prefixed request path.

### trimPrefix(url)

Processes a URL to separate the prefix parts from the main path. Returns an array with two elements: an object containing the identified prefixes and the remaining path.

## Context and State Methods

### getSettings()

Returns active settings if any.

### getRealm()

Returns realm information.

### getContext()

Returns current context.

### setContext(ctx)

Modifies the current context.

### getInitialState()

Returns the initial state passed from SSR execution (or null if no SSR was performed).

### getMode()

Returns the current rendering mode `ssr`, `js` etc.

### getHostname()

Returns the hostname part of the current URL.

### getRegistry()

Returns data from the registry.

### getLocale()

Returns the currently active locale, for example `en-US`.

### getUserGroup()

Returns `g` from context, which is the current active user group.

### getCurrency()

Returns the currently selected currency, such as `USD`.

### getToken()

Returns the CSRF token.

### getUuid()

Returns the UUID of the request.

### getI18N(language)

Retrieves internationalization (i18n) data for a specified language. If no language is provided, uses the current locale.

## Cookie Methods

These methods are required as using things like `document.cookie` will not work in SSR mode. The methods described here will work when SSR is enabled, and will cause cookies to be added to the HTTP response.

### getCookie(cookie)

Get the value of a specific cookie.

### setCookie(cookie, value)

Sets value for a cookie.

### hasCookie(cookie)

Checks for presence of a given cookie.

## Cross-Platform Support

As of version 0.2.0, klbfw includes improved environment detection and cross-platform utilities to support both browser and Node.js environments.

### Environment Detection

The library automatically detects the current environment:

```javascript
const env = {
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node
};
```

### Cross-Platform Utilities

Several utilities have been designed to work across environments:

- **Fetch**: Uses the browser's native `fetch` or `node-fetch` in Node.js
- **XML Parsing**: Uses the browser's `DOMParser` or `xmldom` in Node.js
- **File Reading**: Uses `FileReader` in the browser or `fs` in Node.js
- **Event Dispatching**: Uses `CustomEvent` in the browser or `EventEmitter` in Node.js

### Node.js Requirements

To use klbfw with full functionality in Node.js, install the optional dependencies:

```bash
npm install node-fetch @xmldom/xmldom
```
