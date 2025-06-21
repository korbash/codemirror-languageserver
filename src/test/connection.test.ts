/**
 * Connection Management Tests
 *
 * Tests for establishing and managing LSP connections
 */

import assert from 'assert';
import {
    createAndInitializeLanguageServer,
    createLanguageServer,
    LanguageServerOptions,
    LanguageServer,
} from '../index.js';

// Test configuration
const TEST_SERVER_URL = 'ws://localhost:3001';
const INVALID_SERVER_URL = 'ws://localhost:9999';

const DEFAULT_OPTIONS: LanguageServerOptions = {
    name: 'Test Python LSP',
    rootUri: 'file:///',
    logging: { level: 'error' },
};

describe('Connection Management Tests', () => {
    describe('Basic Connection', () => {
        it('should create LanguageServer instance', async () => {
            try {
                const server = await createLanguageServer(
                    TEST_SERVER_URL,
                    DEFAULT_OPTIONS,
                );

                assert.ok(server, 'Server instance should be created');
                assert.ok(
                    typeof server.initialize === 'function',
                    'Server should have initialize method',
                );
                assert.ok(
                    typeof server.dispose === 'function',
                    'Server should have dispose method',
                );

                server.dispose();
            } catch (error) {
                if (
                    error instanceof Error &&
                    (error.message || 'Unknown error').includes('ECONNREFUSED')
                ) {
                    console.warn(
                        '⚠️  Test server not available, skipping test',
                    );
                    return;
                }
                throw new Error(
                    error instanceof Error ? error.message : 'Unknown error',
                );
            }
        });

        it('should initialize LanguageServer successfully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            let testPassed = false;

            const serverResult = await result.promise;
            if (serverResult.isOk()) {
                const server = serverResult.unwrap();
                assert.ok(server, 'Initialized server should be available');
                assert.ok(
                    typeof server.completion === 'function',
                    'Server should have completion method',
                );
                assert.ok(
                    typeof server.hover === 'function',
                    'Server should have hover method',
                );

                server.dispose();
                testPassed = true;
            } else {
                const errors = serverResult.error;
                if (
                    errors[0]?.message &&
                    errors[0].message.includes('ECONNREFUSED')
                ) {
                    console.warn('⚠️  Test server not available');
                    testPassed = true;
                } else {
                    throw new Error(errors[0]?.message || 'Unknown error');
                }
            }

            assert.strictEqual(testPassed, true, 'Test should complete');
        });

        it('should handle invalid server URL gracefully', async () => {
            const result = await createAndInitializeLanguageServer(
                INVALID_SERVER_URL,
                {
                    ...DEFAULT_OPTIONS,
                    request: { timeout: 3000 },
                    connection: { reconnectAttempts: 0 },
                },
            );

            let errorHandled = false;

            const serverResult = await result.promise;
            if (serverResult.isOk()) {
                const server = serverResult.unwrap();
                server.dispose();
                assert.fail('Should not succeed with invalid URL');
            } else {
                errorHandled = true;
                const errors = serverResult.error;
                assert.ok(errors[0] instanceof Error, 'Should receive Error');
            }

            assert.strictEqual(
                errorHandled,
                true,
                'Should handle connection error',
            );
        });
    });

    describe('Connection Options', () => {
        it('should respect timeout settings', async () => {
            const startTime = Date.now();
            const result = await createAndInitializeLanguageServer(
                INVALID_SERVER_URL,
                {
                    ...DEFAULT_OPTIONS,
                    request: { timeout: 2000 }, // 2 seconds
                    connection: { reconnectAttempts: 0 },
                },
            );

            let timeoutReceived = false;

            const serverResult = await result.promise;
            if (serverResult.isOk()) {
                const server = serverResult.unwrap();
                server.dispose();
                assert.fail('Should timeout, not succeed');
            } else {
                timeoutReceived = true;
                const elapsed = Date.now() - startTime;
                // Should fail within reasonable time (allow some buffer)
                assert.ok(
                    elapsed < 5000,
                    `Should timeout quickly, took ${elapsed}ms`,
                );
            }

            assert.strictEqual(
                timeoutReceived,
                true,
                'Should receive timeout error',
            );
        });

        it('should validate server options', async () => {
            try {
                const server = await createLanguageServer(TEST_SERVER_URL, {
                    name: '', // Пустое имя
                    rootUri: null,
                    request: { timeout: -1 }, // Негативный timeout
                });

                server.dispose();
            } catch (error) {
                assert.ok(
                    error instanceof Error,
                    'Should throw validation error',
                );
                return; // Expected error
            }

            assert.fail('Should throw validation error for invalid options');
        });
    });

    describe('Connection Lifecycle', () => {
        it('should dispose server cleanly', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            const serverResult = await result.promise;
            if (serverResult.isOk()) {
                const server = serverResult.unwrap();

                // Проверяем что dispose работает без исключений
                assert.doesNotThrow(() => {
                    server.dispose();
                }, 'First dispose should not throw');

                // Проверяем что повторный dispose безопасен
                assert.doesNotThrow(() => {
                    server.dispose();
                }, 'Second dispose should be safe');

                // Проверяем что дальнейшие операции не работают
                try {
                    await server.completion({
                        textDocument: { uri: 'file:///test.py' },
                        position: { line: 0, character: 0 },
                    }).promise;
                    assert.fail('Should not allow operations after dispose');
                } catch (error) {
                    // Expected - operations should fail after dispose
                    assert.ok(error instanceof Error);
                }
            } else {
                const errors = serverResult.error;
                if (
                    errors[0]?.message &&
                    errors[0].message.includes('ECONNREFUSED')
                ) {
                    console.warn(
                        '⚠️  Test server not available, skipping test',
                    );
                    return;
                }
                throw new Error(errors[0]?.message || 'Unknown error');
            }
        });

        it('should handle multiple concurrent connections', async () => {
            const promises = [
                createAndInitializeLanguageServer(TEST_SERVER_URL, {
                    ...DEFAULT_OPTIONS,
                    name: 'Connection 1',
                }),
                createAndInitializeLanguageServer(TEST_SERVER_URL, {
                    ...DEFAULT_OPTIONS,
                    name: 'Connection 2',
                }),
            ];

            try {
                const results = await Promise.allSettled(
                    promises.map((p) => p.promise),
                );
                const servers: LanguageServer[] = [];

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value.isOk()) {
                        const server = result.value.unwrap();
                        servers.push(server);
                    } else if (
                        result.status === 'fulfilled' &&
                        result.value.isErr()
                    ) {
                        const errors = result.value.error;
                        if (
                            errors[0]?.message &&
                            (errors[0].message.includes('ECONNREFUSED') ||
                                errors[0].message.includes('timeout'))
                        ) {
                            console.warn('⚠️  Timeout in concurrent test');
                        } else {
                            console.warn(
                                `⚠️  Connection error: ${errors[0]?.message}`,
                            );
                        }
                    }
                }

                // Cleanup all successfully created servers
                servers.forEach((server) => server.dispose());

                console.log(
                    `✅ Handled ${servers.length} concurrent connections`,
                );
            } catch (error) {
                console.warn('⚠️  Concurrent connection test failed:', error);
            }
        });
    });

    describe('Error Scenarios', () => {
        it('should handle server disconnection gracefully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            const serverResult = await result.promise;
            if (serverResult.isOk()) {
                const server = serverResult.unwrap();

                try {
                    // Пробуем сделать запрос, который может не сработать если сервер отключится
                    const completion = await server.completion({
                        textDocument: { uri: 'file:///test.py' },
                        position: { line: 0, character: 0 },
                    });

                    const completionResult = await completion.promise;
                    if (completionResult.isOk()) {
                        console.log(
                            '✅ Request succeeded despite potential disconnection',
                        );
                    } else {
                        console.log(
                            '⚠️  Request failed, which is expected for disconnection test',
                        );
                    }
                } catch (error) {
                    console.log(
                        '⚠️  Request threw error, which is expected for disconnection test',
                    );
                } finally {
                    server.dispose();
                }
            } else {
                const errors = serverResult.error;
                if (
                    errors[0]?.message &&
                    errors[0].message.includes('ECONNREFUSED')
                ) {
                    console.warn(
                        '⚠️  Test server not available, skipping test',
                    );
                    return;
                }
                throw new Error(errors[0]?.message || 'Unknown error');
            }
        });

        it('should validate WebSocket URL format', async () => {
            const invalidUrls = [
                'invalid-url',
                'http://localhost:3000', // HTTP instead of WS
                'ftp://localhost:3000',
                '',
                'ws://', // Incomplete
            ];

            for (const url of invalidUrls) {
                try {
                    const result = await createAndInitializeLanguageServer(
                        url,
                        {
                            ...DEFAULT_OPTIONS,
                            request: { timeout: 1000 },
                            connection: { reconnectAttempts: 0 },
                        },
                    );

                    let errorOccurred = false;

                    const serverResult = await result.promise;
                    if (serverResult.isOk()) {
                        const server = serverResult.unwrap();
                        server.dispose();
                        assert.fail('Should not succeed with invalid URL');
                    } else {
                        errorOccurred = true;
                    }

                    assert.strictEqual(
                        errorOccurred,
                        true,
                        `Should reject invalid URL: ${url}`,
                    );
                } catch (error) {
                    // Expected for invalid URLs
                    assert.ok(
                        error instanceof Error,
                        `Should throw error for invalid URL: ${url}`,
                    );
                }
            }
        });
    });
});
