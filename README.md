# klbfw

Karpeles Lab framework lib

This lib is used on frontend sites to communicate through the KLB API.

## Installation

```bash
npm install @karpeleslab/klbfw
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test
```

# API

## REST API Methods

### rest(api, method, params, context)

Performs a REST query and returns a promise to the response.

### rest_get(name, params)

Simplified version of rest() that uses HTTP GET. Takes a REST API endpoint name and optional parameters, returning a Promise with the response.

### upload(api, params, context)

Perform an upload. This API will show a file selector and allow the user to select one or more files.

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
