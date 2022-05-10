# klbfw

Karpeles Lab framework lib

This lib is used on frontend sites to communicate through the KLB API.

# API

## rest(api, method, params, context)

Performs a rest query and returns a promise to the response.

## upload.init(api, params, context)

Perform an upload. This API will show a file selector and allow the user to select one or more files.

## getPrefix()

Returns the language/etc prefix part of the URL, for example `/l/en-US`. The prefix should be inserted before the path in the URL.

## getSettings()

Returns active settings if any.

## getRealm()

Returns realm information.

## getContext()

Returns current context.

## setContext(ctx)

Modifies the current context.

## getMode()

Returns the current rending mode `ssr`, `js` etc.

## getHostname()

Returns the hostname part of the current URL.

## getRegistry()

Returns data from the registry.

## getLocale()

Returns the currently active locale, for example `en-US`.

## getUserGroup()

Returns `g` from context, which is the current active user group.

## getCurrency()

Returns the currently selected currency, such as `USD`.

## getToken()

Returns the CSRF token.

## getUrl()

Returns the active URL.

## getPath()

Returns the non-prefixed request path.

## getUuid()

Returns the UUID of the request.

## getInitialState()

Returns the initial state passed from SSR execution (or null if no SSR was performed).

# Cookie functions

Those methods are a requirement as using things like `document.cookie` will not work in SSR mode. The methods described here will work when SSR is enabled, and will cause cookies to be added to the HTTP response.

## getCookie(cookie)

Get the value of a specific cookie.

## setCookie(cookie, value)

Sets value for a cookie.

## hasCookie(cookie)

Checks for presence of a given cookie.
