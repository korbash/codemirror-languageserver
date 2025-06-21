/**
 * Simple usage examples for the modernized RequestManager
 *
 * Key features:
 * - Connection is required in constructor
 * - All options passed in RequestOptions
 * - Simple stats and cancellation by ID
 * - AbortController for external cancellation
 */

import { RequestManager } from '../src/core/RequestManager.js';
import { LSPMethods } from '../src/types/index.js';
import { Connection } from 'vscode-languageserver';

// Example 1: Basic usage
async function basicExample(connection: Connection) {
    const requestManager = new RequestManager(connection);

    // Simple request with defaults
    const result = await requestManager.sendRequest(
        LSPMethods.TEXTDOCUMENT_COMPLETION,
        {
            textDocument: { uri: 'file:///test.py' },
            position: { line: 0, character: 0 },
        },
    );

    if (result.success) {
        console.log('✅ Completion items:', result.data);
    } else {
        console.log('❌ Request failed:', result.error);
    }
}

// Example 2: Custom options with retry logic
async function customOptionsExample(connection: Connection) {
    const requestManager = new RequestManager(connection);

    const result = await requestManager.sendRequest(
        LSPMethods.TEXTDOCUMENT_HOVER,
        {
            textDocument: { uri: 'file:///test.py' },
            position: { line: 5, character: 10 },
        },
        {
            timeout: 2000, // 2 second timeout per attempt
            retries: 2, // Try up to 3 times total
            retryCoefficient: 2, // Exponential backoff: 2x delay each retry
            firstTimeout: 1000, // Base delay: 1000ms, 2000ms, 4000ms
        },
    );

    console.log('Request result:', result);
}

// Example 3: External cancellation with AbortController
async function cancellationExample(connection: Connection) {
    const requestManager = new RequestManager(connection);
    const abortController = new AbortController();

    // Start request with external abort signal
    const requestPromise = requestManager.sendRequest(
        LSPMethods.TEXTDOCUMENT_DEFINITION,
        {
            textDocument: { uri: 'file:///large-file.py' },
            position: { line: 1000, character: 50 },
        },
        {
            timeout: 5000,
            abortSignal: abortController.signal, // Link to external cancellation
        },
    );

    // Cancel after 1 second
    setTimeout(() => {
        console.log('🚫 Cancelling request...');
        abortController.abort('User cancelled');
    }, 1000);

    const result = await requestPromise;

    if (result.cancelled) {
        console.log('✅ Request was cancelled as expected');
    }
}

// Example 4: Cancel by request ID
async function cancelByIdExample(connection: Connection) {
    const requestManager = new RequestManager(connection);

    // Start a slow request
    const requestPromise = requestManager.sendRequest(
        LSPMethods.TEXTDOCUMENT_REFERENCES,
        {
            textDocument: { uri: 'file:///test.py' },
            position: { line: 10, character: 5 },
            context: { includeDeclaration: true },
        },
        { timeout: 10000 },
    );

    // Get pending request IDs
    const pendingIds = requestManager.getPendingRequestIds();
    console.log('Pending requests:', pendingIds);

    // Cancel the first pending request
    if (pendingIds.length > 0) {
        const cancelled = requestManager.cancelRequest(
            pendingIds[0],
            'Manual cancellation',
        );
        console.log('Request cancelled:', cancelled);
    }

    const result = await requestPromise;
    console.log('Result after cancellation:', result.type);
}

// Example 5: Monitor statistics
async function statsExample(connection: Connection) {
    const requestManager = new RequestManager(connection);

    // Make several requests
    await requestManager.sendRequest(LSPMethods.TEXTDOCUMENT_COMPLETION, {});
    await requestManager.sendRequest(LSPMethods.TEXTDOCUMENT_HOVER, {});

    // Check stats
    const stats = requestManager.getStats();
    console.log('📊 Request statistics:', {
        total: stats.totalRequests,
        successful: stats.successfulRequests,
        failed: stats.failedRequests,
        cancelled: stats.cancelledRequests,
        successRate: `${Math.round((stats.successfulRequests / stats.totalRequests) * 100)}%`,
    });
}

// Example 6: Error handling patterns
async function errorHandlingExample(connection: Connection) {
    const requestManager = new RequestManager(connection);

    const result = await requestManager.sendRequest(
        LSPMethods.TEXTDOCUMENT_COMPLETION,
        {
            /* params */
        },
        {
            timeout: 3000,
            retries: 1,
        },
    );

    // Pattern matching on result type
    switch (result.type) {
        case 'success':
            console.log('✅ Success:', result.data);
            break;

        case 'error':
            console.log('❌ Error:', result.error.message);
            break;

        case 'cancelled':
            console.log('🚫 Cancelled:', result.error.message);
            break;

        default:
            console.log('❓ Unexpected result type');
    }

    // Or use utility methods
    if (result.success) {
        // TypeScript knows result.data is available
        console.log('Data:', result.data);
    } else {
        // Handle all error cases
        console.log('Failed:', result.error.message);
    }
}

// Example 7: Concurrent requests with shared cancellation
async function concurrentExample(connection: Connection) {
    const requestManager = new RequestManager(connection);
    const abortController = new AbortController();

    // Start multiple requests with shared cancellation
    const requests = [
        requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_COMPLETION,
            {},
            { abortSignal: abortController.signal },
        ),
        requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_HOVER,
            {},
            { abortSignal: abortController.signal },
        ),
        requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_DEFINITION,
            {},
            { abortSignal: abortController.signal },
        ),
    ];

    // Cancel all requests after 2 seconds
    setTimeout(() => {
        abortController.abort('Batch cancellation');
    }, 2000);

    const results = await Promise.allSettled(requests);

    console.log(
        'Results:',
        results.map((r, i) => ({
            index: i,
            status: r.status,
            type: r.status === 'fulfilled' ? r.value.type : 'rejected',
        })),
    );
}

// Export examples for use
export {
    basicExample,
    customOptionsExample,
    cancellationExample,
    cancelByIdExample,
    statsExample,
    errorHandlingExample,
    concurrentExample,
};

// Usage instructions
export const USAGE_NOTES = `
Simplified RequestManager Usage:

1. Always pass Connection in constructor:
   const requestManager = new RequestManager(connection);

2. All configuration goes in RequestOptions:
   - timeout: per-attempt timeout (default: 1000ms)
   - retries: max retry attempts (default: 1)
   - retryCoefficient: backoff multiplier (default: 2)
   - firstTimeout: base retry delay (default: 1000ms)
   - abortSignal: external cancellation

3. Simple API:
   - sendRequest(method, params, options?)
   - cancelRequest(id, reason?)
   - getStats()
   - getPendingRequestIds()

4. Retry delays: firstTimeout * (retryCoefficient ^ attempt)
   Example with defaults: 1000ms, 2000ms, 4000ms

5. Stats only track: total, successful, failed, cancelled
`;
