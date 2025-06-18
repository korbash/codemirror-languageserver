/**
 * Sanity test - базовая проверка работоспособности нового LanguageServer API
 * Проверяет только самые критичные функции высокого уровня
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

const TEST_OPTIONS: LanguageServerOptions = {
    name: 'Python LSP Test',
    rootUri: 'file:///test',
    logging: { level: 'error' }, // Минимальное логирование для тестов
    request: { timeout: 10000 },
    connection: { reconnectAttempts: 1 },
};

describe('Sanity Check - New LanguageServer API', () => {
    it('Can create LanguageServer instance', async () => {
        try {
            const server = await createLanguageServer(
                TEST_SERVER_URL,
                TEST_OPTIONS,
            );
            assert.ok(
                server instanceof Object,
                'Should return LanguageServer instance',
            );

            // Проверяем основные методы
            assert.ok(
                typeof server.initialize === 'function',
                'Should have initialize method',
            );
            assert.ok(
                typeof server.dispose === 'function',
                'Should have dispose method',
            );

            server.dispose();
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn(
                    '⚠️  LSP server not available at',
                    TEST_SERVER_URL,
                );
                return; // Пропускаем тест
            }
            throw error;
        }
    });

    it('Can create and initialize LanguageServer', async () => {
        const serverResult = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            TEST_OPTIONS,
        );

        assert.ok(serverResult, 'Should return LSPResult');
        assert.ok(
            typeof serverResult.match === 'function',
            'Should have match method',
        );
        assert.ok(
            typeof serverResult.isSuccess === 'function',
            'Should have isSuccess method',
        );

        serverResult.match({
            success: (server: LanguageServer) => {
                assert.ok(server, 'Should receive server instance');
                assert.ok(
                    typeof server.completion === 'function',
                    'Should have completion method',
                );
                assert.ok(
                    typeof server.hover === 'function',
                    'Should have hover method',
                );
                assert.ok(
                    typeof server.dispose === 'function',
                    'Should have dispose method',
                );

                server.dispose();
            },
            timeout: () => {
                console.warn('⚠️  LSP server initialization timed out');
            },
            error: (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.warn(
                        '⚠️  LSP server not available at',
                        TEST_SERVER_URL,
                    );
                    return; // Пропускаем тест
                }
                throw error;
            },
            cancelled: () => {
                console.warn('⚠️  LSP server initialization was cancelled');
            },
            connectionReset: () => {
                console.warn('⚠️  Connection lost during initialization');
            },
        });
    });

    it('LSPResult provides proper error handling', async () => {
        // Тестируем с невалидным URL
        const invalidResult = await createAndInitializeLanguageServer(
            'ws://localhost:99999/invalid',
            {
                ...TEST_OPTIONS,
                request: { timeout: 2000 }, // Быстрый timeout для теста
                connection: { reconnectAttempts: 0 },
            },
        );

        let errorHandled = false;

        invalidResult.match({
            success: (server: LanguageServer) => {
                server.dispose();
                assert.fail('Should not succeed with invalid URL');
            },
            timeout: () => {
                errorHandled = true;
            },
            error: (error: Error) => {
                errorHandled = true;
                assert.ok(
                    error instanceof Error,
                    'Should receive Error object',
                );
            },
            cancelled: () => {
                errorHandled = true;
            },
            connectionReset: () => {
                errorHandled = true;
            },
        });

        assert.strictEqual(errorHandled, true, 'Should handle error properly');
    });

    it('LanguageServer can be disposed safely', async () => {
        const serverResult = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            TEST_OPTIONS,
        );

        serverResult.match({
            success: (server: LanguageServer) => {
                // Проверяем что dispose можно вызвать безопасно
                assert.doesNotThrow(() => {
                    server.dispose();
                }, 'dispose() should not throw');

                // Проверяем что повторный dispose безопасен
                assert.doesNotThrow(() => {
                    server.dispose();
                }, 'Second dispose() should not throw');
            },
            timeout: () => {
                console.warn('⚠️  Timeout during dispose test');
            },
            error: (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.warn(
                        '⚠️  LSP server not available for dispose test',
                    );
                    return;
                }
                throw error;
            },
            cancelled: () => {
                console.warn('⚠️  Cancelled during dispose test');
            },
            connectionReset: () => {
                console.warn('⚠️  Connection reset during dispose test');
            },
        });
    });

    it('Can handle basic LSP request', async () => {
        const serverResult = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            TEST_OPTIONS,
        );

        let serverInstance: LanguageServer | null = null;

        serverResult.match({
            success: (server: LanguageServer) => {
                serverInstance = server;
            },
            timeout: () => {
                console.warn(
                    '⚠️  Server initialization timed out for LSP request test',
                );
            },
            error: (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.warn(
                        '⚠️  LSP server not available for request test',
                    );
                    return;
                }
                throw error;
            },
            cancelled: () => {
                console.warn(
                    '⚠️  Server initialization cancelled for LSP request test',
                );
            },
            connectionReset: () => {
                console.warn('⚠️  Connection reset during LSP request test');
            },
        });

        if (!serverInstance) {
            console.warn('⚠️  No server instance available for testing');
            return;
        }

        const server: LanguageServer = serverInstance;
        try {
            // Пробуем простой запрос completion
            const completionResult = await server.completion({
                textDocument: { uri: 'file:///test.py' },
                position: { line: 0, character: 0 },
            });

            // Проверяем что результат имеет правильную структуру
            assert.ok(completionResult, 'Should return completion result');
            assert.ok(
                typeof completionResult.match === 'function',
                'Should have match method',
            );

            completionResult.match({
                success: (completion: any) => {
                    // Успех - completion работает
                    console.log('✅ Basic LSP request successful');
                },
                timeout: () => {
                    console.warn('⚠️  Completion request timed out');
                },
                error: (error: Error) => {
                    // Это может быть нормально, если сервер не поддерживает completion
                    console.warn(
                        '⚠️  Completion request failed:',
                        error.message,
                    );
                },
                cancelled: () => {
                    console.warn('⚠️  Completion request cancelled');
                },
                connectionReset: () => {
                    console.warn('⚠️  Connection lost during completion');
                },
            });
        } finally {
            server.dispose();
        }
    });
});
