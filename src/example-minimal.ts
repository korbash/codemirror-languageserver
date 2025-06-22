/**
 * Minimal example demonstrating the simplified LanguageClient
 */

import { LanguageClient, createLanguageClient, ServerState } from './index.js';
import type { LanguageClientOptions } from './core/LanguageClient.js';

/**
 * Basic minimal example
 */
async function minimalExample() {
    console.log('=== Minimal LanguageClient Example ===');

    const client = new LanguageClient({
        wsUrl: 'ws://localhost:3000',
        name: 'Python LSP',
        rootUri: 'file:///workspace',
        maxRetries: 5,
        connectionTimeout: 10000,
    });

    // Subscribe to state changes using RxJS
    client.state$.subscribe((state) => {
        console.log(`State: ${state}`);
    });

    // Subscribe to ready state
    client.isReady$.subscribe(() => {
        console.log('✅ Client ready for requests');
    });

    // Subscribe to errors
    client.error$.subscribe((error) => {
        console.error('❌ Error:', error.message);
    });

    try {
        // Wait for client to be ready (auto-connects)
        await new Promise<void>((resolve) => {
            client.isReady$.subscribe(() => resolve());
        });
        console.log('✅ Client auto-connected and ready');

        // Send generic requests (no wrapper methods)
        const completion = await client.request('textDocument/completion', {
            textDocument: { uri: 'file:///workspace/test.py' },
            position: { line: 0, character: 5 },
        });
        console.log('Completion result:', completion);

        const hover = await client.request('textDocument/hover', {
            textDocument: { uri: 'file:///workspace/test.py' },
            position: { line: 0, character: 5 },
        });
        console.log('Hover result:', hover);

        // Send notifications
        await client.sendNotification('textDocument/didOpen', {
            textDocument: {
                uri: 'file:///workspace/test.py',
                languageId: 'python',
                version: 1,
                text: 'print("Hello")',
            },
        });

        // Wait a bit for potential operations
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await client.shutdown();
        client.dispose();
    } catch (error) {
        console.error('❌ Example failed:', error);
        client.dispose();
    }
}

/**
 * Using factory function
 */
async function factoryExample() {
    console.log('\n=== Factory Function Example ===');

    try {
        const client = createLanguageClient({
            wsUrl: 'ws://localhost:3000',
            name: 'TypeScript LSP',
            rootUri: 'file:///project',
        });

        console.log('✅ Created client via factory function');

        // Wait for auto-connection
        await new Promise<void>((resolve) => {
            client.isReady$.subscribe(() => resolve());
        });
        console.log('✅ Auto-connected and ready');

        // Use modern disposal syntax
        using autoDisposedClient = client;

        // Subscribe to capabilities
        client.capabilities$.subscribe((caps) => {
            if (caps) {
                console.log('Capabilities:', {
                    completion: !!caps.completionProvider,
                    hover: !!caps.hoverProvider,
                    definition: !!caps.definitionProvider,
                });
            }
        });

        // Send a request
        const symbols = await client.request('textDocument/documentSymbol', {
            textDocument: { uri: 'file:///project/src/main.ts' },
        });
        console.log('Document symbols:', symbols);

        // Manual cleanup
        await client.shutdown();
        client.dispose();
    } catch (error) {
        console.error('❌ Factory example failed:', error);
    }
}

/**
 * Reactive patterns with minimal API
 */
async function reactiveExample() {
    console.log('\n=== Reactive Patterns Example ===');

    const client = new LanguageClient({
        wsUrl: 'ws://localhost:3000',
        name: 'Reactive LSP',
        rootUri: 'file:///reactive',
    });

    // Reactive state monitoring
    client.state$.subscribe({
        next: (state) => console.log(`📊 State: ${state}`),
        complete: () => console.log('📊 State stream completed'),
    });

    // Only listen when ready
    client.isReady$.subscribe(() => {
        console.log('🟢 Ready - can send requests now');
    });

    // Error handling
    client.error$.subscribe({
        next: (error) => console.error('🔴 Error stream:', error.message),
        complete: () => console.log('🔴 Error stream completed'),
    });

    try {
        // Client auto-connects on creation

        // Send multiple requests
        const requests = [
            client.request('textDocument/hover', {
                textDocument: { uri: 'file:///reactive/test.py' },
                position: { line: 0, character: 0 },
            }),
            client.request('textDocument/completion', {
                textDocument: { uri: 'file:///reactive/test.py' },
                position: { line: 0, character: 0 },
            }),
        ];

        const results = await Promise.allSettled(requests);
        console.log('Batch results:', results);

        await client.shutdown();
    } catch (error) {
        console.error('❌ Reactive example failed:', error);
    } finally {
        client.dispose(); // This completes all observables
    }
}

/**
 * Error handling and recovery
 */
async function errorHandlingExample() {
    console.log('\n=== Error Handling Example ===');

    const client = new LanguageClient({
        wsUrl: 'ws://localhost:9999', // Wrong port
        name: 'Error Demo',
        rootUri: 'file:///error',
        maxRetries: 2,
        connectionTimeout: 2000,
    });

    // Monitor all errors
    client.error$.subscribe((error) => {
        console.log('🔍 Caught error:', error.message);
    });

    // Monitor state transitions
    client.state$.subscribe((state) => {
        console.log(`🔄 State: ${state}`);
    });

    try {
        // Monitor for connection errors
        const errorPromise = new Promise<void>((resolve) => {
            client.error$.subscribe(() => resolve());
        });

        await Promise.race([
            new Promise<void>((resolve) => {
                client.isReady$.subscribe(() => resolve());
            }),
            errorPromise,
        ]);

        console.log('✅ Connected despite wrong port');
    } catch (error) {
        console.log(
            '❌ Expected connection failure:',
            error instanceof Error ? error.message : String(error),
        );
    }

    client.dispose();
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('🚀 Starting Ultra-Minimal LanguageClient Examples');
    console.log('==================================================');

    try {
        await minimalExample();
        await factoryExample();
        await reactiveExample();
        await errorHandlingExample();
    } catch (error) {
        console.error('❌ Example execution failed:', error);
    }

    console.log('\n✅ All ultra-minimal examples completed');
}

// Export for use in other modules
export {
    minimalExample,
    factoryExample,
    reactiveExample,
    errorHandlingExample,
    runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}
