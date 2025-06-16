/**
 * LSP Protocol tests - тесты Language Server Protocol
 * По образцу Microsoft vscode-languageserver-node
 */

import assert from 'assert';
import { WebSocketTransport } from '../transports/WebSocketTransport.js';
import * as LSP from 'vscode-languageserver-protocol';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

describe('LSP Protocol', () => {
    it('Initialize LSP server', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            const result = await connection.sendRequest(
                LSP.InitializeRequest.type,
                {
                    processId: null,
                    rootUri: 'file:///test',
                    capabilities: {
                        textDocument: {
                            completion: { dynamicRegistration: false },
                        },
                    },
                },
            );

            assert.ok(result, 'Initialize should return result');
            assert.ok(
                result.capabilities,
                'Result should contain capabilities',
            );
            assert.strictEqual(
                typeof result.capabilities,
                'object',
                'Capabilities should be an object',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Initialize with full capabilities', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            const initParams: LSP.InitializeParams = {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {
                    textDocument: {
                        completion: {
                            dynamicRegistration: false,
                            completionItem: {
                                snippetSupport: false,
                                commitCharactersSupport: false,
                                documentationFormat: ['markdown', 'plaintext'],
                            },
                        },
                        hover: {
                            dynamicRegistration: false,
                            contentFormat: ['markdown', 'plaintext'],
                        },
                        synchronization: {
                            dynamicRegistration: false,
                            willSave: false,
                            willSaveWaitUntil: false,
                            didSave: true,
                        },
                    },
                    workspace: {
                        workspaceFolders: false,
                        configuration: false,
                    },
                },
                clientInfo: {
                    name: 'codemirror-languageserver-test',
                    version: '1.0.0',
                },
            };

            const result = await connection.sendRequest(
                LSP.InitializeRequest.type,
                initParams,
            );

            assert.ok(
                result.capabilities,
                'Server capabilities should be defined',
            );

            const capabilities = result.capabilities;
            const capabilityKeys = Object.keys(capabilities);
            assert.ok(
                capabilityKeys.length > 0,
                'Server should provide at least one capability',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Send initialized notification', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            // Сначала initialize
            await connection.sendRequest(LSP.InitializeRequest.type, {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {},
            });

            // Затем initialized notification
            await connection.sendNotification(
                LSP.InitializedNotification.type,
                {},
            );

            // Если дошли до сюда без ошибки - тест прошел
            assert.ok(true, 'Initialized notification sent successfully');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Check server info', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            const result = await connection.sendRequest(
                LSP.InitializeRequest.type,
                {
                    processId: null,
                    rootUri: 'file:///test',
                    capabilities: {},
                },
            );

            // Проверяем server info (может быть undefined, что нормально)
            if (result.serverInfo) {
                assert.strictEqual(
                    typeof result.serverInfo.name,
                    'string',
                    'Server name should be string',
                );

                if (result.serverInfo.version) {
                    assert.strictEqual(
                        typeof result.serverInfo.version,
                        'string',
                        'Server version should be string',
                    );
                }
            }
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Analyze server capabilities', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            const result = await connection.sendRequest(
                LSP.InitializeRequest.type,
                {
                    processId: null,
                    rootUri: 'file:///test',
                    capabilities: {},
                },
            );

            const capabilities = result.capabilities;
            const capabilityKeys = Object.keys(capabilities);

            // Проверяем структуру capabilities
            assert.ok(
                Array.isArray(capabilityKeys),
                'Capability keys should be array',
            );

            // Проверяем что capabilities не пустые
            assert.ok(
                capabilityKeys.length > 0,
                'Server should provide capabilities',
            );

            console.log(
                `      Available capabilities: ${capabilityKeys.join(', ')}`,
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Handle nonexistent method', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            // Сначала инициализируем
            await connection.sendRequest(LSP.InitializeRequest.type, {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {},
            });

            // Пытаемся отправить несуществующий запрос
            try {
                await connection.sendRequest('nonexistent/method' as any, {});
                assert.fail('Should throw error for nonexistent method');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should be an Error');
                const errorMessage = error.message;
                // LSP сервер может возвращать разные ошибки для неизвестных методов
                assert.ok(
                    errorMessage.includes('Method not found') ||
                        errorMessage.includes('method not found') ||
                        errorMessage.includes('Unknown method') ||
                        errorMessage.includes('unknown method') ||
                        errorMessage.includes('Unhandled method'),
                    `Error should mention unknown method, got: ${errorMessage}`,
                );
            }
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Send textDocument/didOpen notification', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            // Инициализируем
            await connection.sendRequest(LSP.InitializeRequest.type, {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {
                    textDocument: {
                        synchronization: { dynamicRegistration: false },
                    },
                },
            });

            await connection.sendNotification(
                LSP.InitializedNotification.type,
                {},
            );

            // Отправляем didOpen notification
            await connection.sendNotification(
                LSP.DidOpenTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///test.py',
                        languageId: 'python',
                        version: 1,
                        text: 'print("Hello, World!")',
                    },
                },
            );

            assert.ok(true, 'didOpen notification sent successfully');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Send textDocument/didChange notification', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            // Инициализируем
            await connection.sendRequest(LSP.InitializeRequest.type, {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {
                    textDocument: {
                        synchronization: { dynamicRegistration: false },
                    },
                },
            });

            await connection.sendNotification(
                LSP.InitializedNotification.type,
                {},
            );

            // Сначала didOpen
            await connection.sendNotification(
                LSP.DidOpenTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///test.py',
                        languageId: 'python',
                        version: 1,
                        text: 'print("Hello")',
                    },
                },
            );

            // Затем didChange
            await connection.sendNotification(
                LSP.DidChangeTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///test.py',
                        version: 2,
                    },
                    contentChanges: [
                        {
                            text: 'print("Hello, World!")',
                        },
                    ],
                },
            );

            assert.ok(true, 'didChange notification sent successfully');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Full document lifecycle', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            // 1. Инициализация
            const initResult = await connection.sendRequest(
                LSP.InitializeRequest.type,
                {
                    processId: null,
                    rootUri: 'file:///workspace',
                    capabilities: {
                        textDocument: {
                            synchronization: { dynamicRegistration: false },
                            completion: { dynamicRegistration: false },
                            hover: { dynamicRegistration: false },
                        },
                    },
                },
            );

            await connection.sendNotification(
                LSP.InitializedNotification.type,
                {},
            );

            // 2. Открытие документа
            await connection.sendNotification(
                LSP.DidOpenTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///workspace/main.py',
                        languageId: 'python',
                        version: 1,
                        text: 'def hello():\n    print("Hello")',
                    },
                },
            );

            // 3. Изменение документа
            await connection.sendNotification(
                LSP.DidChangeTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///workspace/main.py',
                        version: 2,
                    },
                    contentChanges: [
                        {
                            text: 'def hello():\n    print("Hello, World!")',
                        },
                    ],
                },
            );

            // 4. Закрытие документа
            await connection.sendNotification(
                LSP.DidCloseTextDocumentNotification.type,
                {
                    textDocument: {
                        uri: 'file:///workspace/main.py',
                    },
                },
            );

            assert.ok(true, 'Full document lifecycle completed successfully');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  LSP server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });
});
