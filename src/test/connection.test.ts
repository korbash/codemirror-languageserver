/**
 * Connection tests - тесты подключения WebSocket транспорта
 * По образцу Microsoft vscode-languageserver-node
 */

import assert from 'assert';
import { WebSocketTransport } from '../transports/WebSocketTransport.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';
const INVALID_SERVER_URL = 'ws://localhost:99999/invalid';

describe('WebSocket Connection', () => {
    it('Connect to valid server', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(transport.isConnected, true);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Connect to invalid server throws error', async () => {
        const transport = new WebSocketTransport(INVALID_SERVER_URL);

        try {
            await transport.connect();
            assert.fail('Should throw error for invalid server');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(
                error.message.includes('ECONNREFUSED') ||
                    error.message.includes('connection failed') ||
                    error.message.includes('failed to connect') ||
                    error.message.includes('ENOTFOUND') ||
                    error.message.includes('connect ECONNREFUSED') ||
                    error.message.includes('Invalid URL'),
                `Expected connection error, got: ${error.message}`,
            );
        } finally {
            transport.close();
        }
    });

    it('Get connection after connect', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();

            const connection = transport.connection;
            assert.ok(connection, 'Connection should be available');
            assert.ok(
                typeof connection.sendRequest === 'function',
                'Connection should have sendRequest method',
            );
            assert.ok(
                typeof connection.sendNotification === 'function',
                'Connection should have sendNotification method',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Get connection before connect throws error', () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            transport.connection;
            assert.fail(
                'Should throw error when getting connection before connect',
            );
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(
                error.message.includes('not connected') ||
                    error.message.includes('Not connected'),
            );
        } finally {
            transport.close();
        }
    });

    it('Connect twice throws error', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(transport.isConnected, true);

            try {
                await transport.connect();
                assert.fail('Should throw error on second connect');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(
                    error.message.includes('already connected') ||
                        error.message.includes('Already connected'),
                );
            }
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Close connection', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(transport.isConnected, true);

            transport.close();
            assert.strictEqual(transport.isConnected, false);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        }
    });

    it('Multiple close calls are safe', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();

            // Множественные вызовы close() не должны вызывать ошибок
            transport.close();
            transport.close();
            transport.close();

            assert.strictEqual(transport.isConnected, false);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        }
    });

    it('Connection state reflects correctly', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        // Изначально не подключен
        assert.strictEqual(transport.isConnected, false);

        try {
            // После подключения
            await transport.connect();
            assert.strictEqual(transport.isConnected, true);

            // После закрытия
            transport.close();
            assert.strictEqual(transport.isConnected, false);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        }
    });

    it('Debug info is available', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        // Debug info должна быть доступна даже до подключения
        const debugInfo = transport.debugInfo;
        assert.ok(
            typeof debugInfo === 'object',
            'Debug info should be an object',
        );
        assert.ok('url' in debugInfo, 'Debug info should contain URL');

        try {
            await transport.connect();
            const connectedDebugInfo = transport.debugInfo;
            assert.ok(
                'url' in connectedDebugInfo,
                'Debug info should contain URL after connect',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn('⚠️  Test server not available, skipping test');
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('Sequential connections work', async () => {
        for (let i = 0; i < 3; i++) {
            const transport = new WebSocketTransport(TEST_SERVER_URL);

            try {
                await transport.connect();
                assert.strictEqual(
                    transport.isConnected,
                    true,
                    `Connection ${i + 1} should succeed`,
                );

                transport.close();
                assert.strictEqual(
                    transport.isConnected,
                    false,
                    `Connection ${i + 1} should close`,
                );
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes('ECONNREFUSED')
                ) {
                    console.warn(
                        '⚠️  Test server not available, skipping test',
                    );
                    return;
                }
                throw error;
            }
        }
    });
});
