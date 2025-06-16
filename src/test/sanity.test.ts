/**
 * Sanity test - базовая проверка работоспособности
 * Проверяет только самые критичные функции
 */

import assert from 'assert';
import { WebSocketTransport } from '../transports/WebSocketTransport.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

describe('Sanity Check', () => {
    it('WebSocket transport can connect', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(
                transport.isConnected,
                true,
                'Transport should be connected',
            );
        } catch (error) {
            // Если сервер недоступен, это не ошибка теста, а проблема окружения
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
        } finally {
            transport.close();
        }
    });

    it('WebSocket transport provides connection after connect', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();

            // Проверяем что connection доступен
            const connection = transport.connection;
            assert.ok(
                connection,
                'Connection should be available after connect',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn(
                    '⚠️  LSP server not available at',
                    TEST_SERVER_URL,
                );
                return;
            }
            throw error;
        } finally {
            transport.close();
        }
    });

    it('WebSocket transport throws error when accessing connection before connect', () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            // Это должно выбросить ошибку
            transport.connection;
            assert.fail(
                'Should throw error when accessing connection before connect',
            );
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok(
                error.message.includes('not connected') ||
                    error.message.includes('Not connected'),
                `Error message should mention not connected, got: ${error.message}`,
            );
        } finally {
            transport.close();
        }
    });

    it('WebSocket transport can be closed safely', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(transport.isConnected, true);

            transport.close();
            assert.strictEqual(
                transport.isConnected,
                false,
                'Should be disconnected after close',
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('ECONNREFUSED')
            ) {
                console.warn(
                    '⚠️  LSP server not available at',
                    TEST_SERVER_URL,
                );
                return;
            }
            throw error;
        }
    });
});
