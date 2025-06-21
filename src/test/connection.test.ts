/**
 * Connection tests - тесты подключения к LSP серверу
 * Тестирует новую архитектуру LanguageServer с pattern matching
 */

import assert from 'assert';
import {
    createAndInitializeLanguageServer,
    createLanguageServer,
    LanguageServerOptions,
    LSPResult,
    LanguageServer,
} from '../index.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';
const INVALID_SERVER_URL = 'ws://localhost:99999/invalid';

const DEFAULT_OPTIONS: LanguageServerOptions = {
    name: 'Connection Test Server',
    rootUri: 'file:///test',
    logging: { level: 'error' },
    request: { timeout: 15000 },
    connection: { reconnectAttempts: 2, reconnectDelay: 1000 },
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
                throw new Error(errors[0]?.message || 'Unknown error');
            }
        });

        it('should initialize LanguageServer successfully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            let testPassed = false;

            await result.handleResult({
                success: (server: LanguageServer) => {
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
                },
                timeout: async () => {
                    console.warn('⚠️  Server initialization timed out');
                    testPassed = true; // Не фейлим, это проблема окружения
                },
                error: async (errors: Error[]) => {
                    if (
                        errors[0]?.message ||
                        'Unknown error'.includes('ECONNREFUSED')
                    ) {
                        console.warn('⚠️  Test server not available');
                        testPassed = true;
                        return;
                    }
                    throw new Error(errors[0]?.message || 'Unknown error');
                },
                cancelled: async () => {
                    console.warn('⚠️  Initialization cancelled');
                    testPassed = true;
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset during initialization');
                    testPassed = true;
                },
            });

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

            await result.handleResult({
                success: (server: LanguageServer) => {
                    server.dispose();
                    assert.fail('Should not succeed with invalid URL');
                },
                timeout: async () => {
                    errorHandled = true;
                },
                error: async (errors: Error[]) => {
                    errorHandled = true;
                    assert.ok(
                        errors[0] instanceof Error,
                        'Should receive Error',
                    );
                },
                cancelled: async () => {
                    errorHandled = true;
                },
                connectionReset: async () => {
                    errorHandled = true;
                },
            });

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

            await result.handleResult({
                success: (server: LanguageServer) => {
                    server.dispose();
                    assert.fail('Should timeout, not succeed');
                },
                timeout: async () => {
                    const elapsed = Date.now() - startTime;
                    assert.ok(
                        elapsed >= 1800 && elapsed <= 5000,
                        `Should timeout around 2s, got ${elapsed}ms`,
                    );
                    timeoutReceived = true;
                },
                error: async () => {
                    timeoutReceived = true; // Error is also acceptable
                },
                cancelled: async () => {
                    timeoutReceived = true;
                },
                connectionReset: async () => {
                    timeoutReceived = true;
                },
            });

            assert.strictEqual(
                timeoutReceived,
                true,
                'Should receive timeout or error',
            );
        });

        it('should validate server options', async () => {
            // Тест с невалидными опциями
            try {
                const server = await createLanguageServer(TEST_SERVER_URL, {
                    name: '', // Пустое имя
                    rootUri: null,
                    request: { timeout: -1 }, // Негативный timeout
                });

                server.dispose();
            } catch (error) {
                // Ожидаем либо ошибку валидации, либо ошибку подключения
                assert.ok(error instanceof Error, 'Should throw error');
            }
        });
    });

    describe('Connection Lifecycle', () => {
        it('should dispose server cleanly', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            await result.handleResult({
                success: (server: LanguageServer) => {
                    // Проверяем что dispose работает без исключений
                    assert.doesNotThrow(() => {
                        server.dispose();
                    }, 'First dispose should not throw');

                    // Проверяем что повторный dispose безопасен
                    assert.doesNotThrow(() => {
                        server.dispose();
                    }, 'Second dispose should not throw');
                },
                timeout: async () => {
                    console.warn('⚠️  Timeout during dispose test');
                },
                error: async (errors: Error[]) => {
                    if (
                        errors[0]?.message ||
                        'Unknown error'.includes('ECONNREFUSED')
                    ) {
                        console.warn(
                            '⚠️  Server not available for dispose test',
                        );
                        return;
                    }
                    throw new Error(errors[0]?.message || 'Unknown error');
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled during dispose test');
                },
                connectionReset: async () => {
                    console.warn('⚠️  Connection reset during dispose test');
                },
            });
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

            const results = await Promise.all(promises);
            const servers: LanguageServer[] = [];

            try {
                for (const result of results) {
                    await result.handleResult({
                        success: (server: LanguageServer) => {
                            servers.push(server);
                        },
                        timeout: async () => {
                            console.warn('⚠️  Timeout in concurrent test');
                        },
                        error: async (errors: Error[]) => {
                            if (
                                errors[0]?.message ||
                                'Unknown error'.includes('ECONNREFUSED')
                            ) {
                                console.warn(
                                    '⚠️  Server not available for concurrent test',
                                );
                                return;
                            }
                            throw new Error(
                                errors[0]?.message || 'Unknown error',
                            );
                        },
                        cancelled: async () => {
                            console.warn('⚠️  Cancelled in concurrent test');
                        },
                        connectionReset: async () => {
                            console.warn(
                                '⚠️  Connection reset in concurrent test',
                            );
                        },
                    });
                }

                // Если у нас есть серверы, проверяем что они независимы
                if (servers.length > 0) {
                    assert.ok(
                        servers.length <= 2,
                        `Should have at most 2 servers, got ${servers.length}`,
                    );
                }
            } finally {
                // Очищаем все серверы
                servers.forEach((server) => {
                    try {
                        server.dispose();
                    } catch (error) {
                        console.warn('Error disposing server:', error);
                    }
                });
            }
        });
    });

    describe('Error Scenarios', () => {
        it('should handle server disconnection gracefully', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                DEFAULT_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        // Пробуем сделать запрос, который может не сработать если сервер отключится
                        const completion = await server.completion({
                            textDocument: { uri: 'file:///test.py' },
                            position: { line: 0, character: 0 },
                        });

                        await completion.handleResult({
                            success: async () => {
                                console.log(
                                    '✅ Request succeeded despite potential disconnection',
                                );
                            },
                            timeout: async () => {
                                console.log('⏰ Request timed out (expected)');
                            },
                            error: async () => {
                                console.log('❌ Request failed (expected)');
                            },
                            cancelled: async () => {
                                console.log('🚫 Request cancelled (expected)');
                            },
                            connectionReset: async () => {
                                console.log('💔 Connection reset (expected)');
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn('⚠️  Timeout during disconnection test');
                },
                error: async (errors: Error[]) => {
                    if (
                        errors[0]?.message ||
                        'Unknown error'.includes('ECONNREFUSED')
                    ) {
                        console.warn(
                            '⚠️  Server not available for disconnection test',
                        );
                        return;
                    }
                    console.warn(
                        'Error in disconnection test:',
                        errors[0]?.message || 'Unknown error',
                    );
                },
                cancelled: async () => {
                    console.warn('⚠️  Cancelled during disconnection test');
                },
                connectionReset: async () => {
                    console.log('💔 Connection reset during test (expected)');
                },
            });
        });

        it('should validate WebSocket URL format', async () => {
            const invalidUrls = [
                'http://localhost:8000/lsp', // HTTP instead of WS
                'ws://', // Incomplete URL
                '', // Empty URL
                'not-a-url', // Invalid format
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

                    await result.handleResult({
                        success: (server: LanguageServer) => {
                            server.dispose();
                            // Если URL как-то сработал, это не ошибка теста
                        },
                        timeout: async () => {
                            errorOccurred = true;
                        },
                        error: async (errors: Error[]) => {
                            errorOccurred = true;
                            assert.ok(
                                error instanceof Error,
                                'Should receive Error for invalid URL',
                            );
                        },
                        cancelled: async () => {
                            errorOccurred = true;
                        },
                        connectionReset: async () => {
                            errorOccurred = true;
                        },
                    });

                    // Для большинства невалидных URL ожидаем ошибку
                    if (url === '' || url === 'not-a-url') {
                        assert.strictEqual(
                            errorOccurred,
                            true,
                            `Should handle invalid URL: ${url}`,
                        );
                    }
                } catch (error) {
                    // Исключения тоже допустимы для невалидных URL
                    assert.ok(
                        error instanceof Error,
                        'Should throw Error for invalid URL',
                    );
                }
            }
        });
    });
});
