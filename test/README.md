# klbfw Testing

This directory contains tests for the KarpelesLab Frontend Framework.

## Test Structure

- `setup.js` - Common test setup and utilities
- `cookies.test.js` - Tests for cookie handling
- `rest.test.js` - Tests for REST API client functionality
- `util.test.js` - Tests for utility functions
- `api.test.js` - Tests for API endpoint mocks
- `upload.test.js` - Tests for file upload functionality
- `integration.test.js` - Real API integration tests

## Running Tests

### Unit Tests

Regular unit tests use mocks to simulate API responses:

```bash
npm test
```

### Integration Tests

Integration tests call actual API endpoints. To run them, you need to:

1. Set up environment variables:

```bash
export RUN_INTEGRATION_TESTS=true
export API_BASE_URL=https://your-api-server.com
export API_TOKEN=your_api_token
```

2. Run the integration tests:

```bash
npm test -- test/integration.test.js
```

For file upload tests (which require a browser environment):

```bash
export RUN_UPLOAD_TESTS=true
npm test -- test/integration.test.js
```

## Debug Endpoints

The integration tests use special debug endpoints:

- `Misc/Debug:request` - Returns information about the request
- `Misc/Debug:params` - Returns the parameters that were sent
- `Misc/Debug:fixedString` - Returns a fixed string "fixed string"
- `Misc/Debug:error` - Throws an error
- `Misc/Debug:testUpload` - Used for testing file uploads

These endpoints should be available on your test server for integration tests to work properly.