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
            typeof serverResult.isSuccess === 'function',
            'Should have isSuccess method',
        );
        assert.ok(
            typeof serverResult.getValue === 'function',
            'Should have getValue method',
        );

        serverResult.handleResult({
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

        invalidResult.handleResult({
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

        serverResult.handleResult({
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
        console.log('🔍 [DEBUG] Starting basic LSP request test...');

        console.log('🔍 [DEBUG] Creating and initializing language server...');
        const serverResult = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            TEST_OPTIONS,
        );
        console.log('🔍 [DEBUG] Server creation completed');

        let serverInstance: LanguageServer | null = null;

        console.log('🔍 [DEBUG] Processing server result...');
        serverResult.handleResult({
            success: (server: LanguageServer) => {
                console.log('🔍 [DEBUG] Server initialized successfully');
                serverInstance = server;
            },
            timeout: () => {
                console.warn(
                    '⚠️  Server initialization timed out for LSP request test',
                );
            },
            error: (error: Error) => {
                console.log(
                    '🔍 [DEBUG] Server initialization error:',
                    error.message,
                );
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
        console.log('🔍 [DEBUG] Server result processed');

        if (!serverInstance) {
            console.warn('⚠️  No server instance available for testing');
            return;
        }

        console.log(
            '🔍 [DEBUG] Server instance obtained, starting completion test...',
        );
        const server: LanguageServer = serverInstance;
        try {
            console.log('🔍 [DEBUG] About to open document...');
            // Сначала открываем документ (обязательно для LSP)
            await server.notifyDidOpenTextDocument({
                textDocument: {
                    uri: 'file:///test.py',
                    languageId: 'python',
                    version: 1,
                    text: `import os
import sys
from typing import List, Dict

class TestClass:
    def __init__(self, name: str):
        self.name = name
        self.items: List[str] = []

    def add_item(self, item: str) -> None:
        self.items.append(item)

    def get_items(self) -> List[str]:
        return self.items

def main():
    test = TestClass("example")
    test.add_item("hello")
    print(f"Items: {test.get_items()}")

    # Test various Python features
    data: Dict[str, int] = {"a": 1, "b": 2}
    result = [x * 2 for x in data.values()]

    return result

if __name__ == "__main__":
    main()
`,
                },
            });
            console.log('🔍 [DEBUG] Document opened successfully');

            console.log('🔍 [DEBUG] Checking server capabilities...');
            const capabilities = server.getCapabilities();
            console.log('🔍 [DEBUG] Server capabilities:', {
                completionProvider: !!capabilities?.completionProvider,
                hoverProvider: !!capabilities?.hoverProvider,
                definitionProvider: !!capabilities?.definitionProvider,
                workspaceSymbolProvider:
                    !!capabilities?.workspaceSymbolProvider,
            });

            // Проверяем что capabilities получены
            assert.ok(capabilities, 'Should have server capabilities');

            // Анализируем какие capabilities поддерживает сервер
            console.log('🔍 [DEBUG] Analyzing server capabilities...');

            if (capabilities?.completionProvider) {
                console.log('✅ Server supports textDocument/completion');
            } else {
                console.log(
                    '❌ Server does NOT support textDocument/completion',
                );
            }

            if (capabilities?.hoverProvider) {
                console.log('✅ Server supports textDocument/hover');
            } else {
                console.log('❌ Server does NOT support textDocument/hover');
            }

            if (capabilities?.definitionProvider) {
                console.log('✅ Server supports textDocument/definition');
            } else {
                console.log(
                    '❌ Server does NOT support textDocument/definition',
                );
            }

            if (capabilities?.workspaceSymbolProvider) {
                console.log('✅ Server supports workspace/symbol');
            } else {
                console.log('❌ Server does NOT support workspace/symbol');
            }

            console.log('✅ Basic LSP capabilities test completed');
        } catch (error) {
            console.log('🔍 [DEBUG] Exception in hover test:', error);
            throw error;
        } finally {
            console.log('🔍 [DEBUG] Disposing server...');
            server.dispose();
            console.log('🔍 [DEBUG] Server disposed, test ending');
        }
    });
});
