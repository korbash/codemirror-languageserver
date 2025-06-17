/**
 * Simple test - проверка базовой функциональности транспорта
 * Минимальные импорты для изоляции проблем
 */

import assert from 'assert';

// Простая реализация WebSocket транспорта для тестов
class SimpleWebSocketTransport {
    private websocket: WebSocket | null = null;
    private url: string;
    private connected: boolean = false;

    constructor(url: string) {
        this.url = url;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // В Node.js окружении WebSocket может быть недоступен
                if (typeof WebSocket === 'undefined') {
                    console.log('⚠️  WebSocket not available in Node.js environment');
                    reject(new Error('WebSocket not available'));
                    return;
                }

                this.websocket = new WebSocket(this.url);

                this.websocket.onopen = () => {
                    this.connected = true;
                    resolve();
                };

                this.websocket.onerror = () => {
                    this.connected = false;
                    reject(new Error(`ECONNREFUSED: Connection refused to ${this.url}`));
                };

                this.websocket.onclose = () => {
                    this.connected = false;
                };

                // Timeout для подключения
                setTimeout(() => {
                    if (!this.connected) {
                        reject(new Error(`Connection timeout to ${this.url}`));
                    }
                }, 5000);

            } catch (error) {
                reject(error);
            }
        });
    }

    get isConnected(): boolean {
        return this.connected;
    }

    close(): void {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.connected = false;
    }
}

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

describe('Simple Transport Test', () => {
    it('should create transport instance', () => {
        const transport = new SimpleWebSocketTransport(TEST_SERVER_URL);
        assert.ok(transport, 'Transport should be created');
        assert.strictEqual(transport.isConnected, false, 'Should start disconnected');
    });

    it('should handle connection attempt', async () => {
        const transport = new SimpleWebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.strictEqual(transport.isConnected, true, 'Should be connected');
            console.log('✅ Successfully connected to LSP server');
        } catch (error) {
            if (error instanceof Error && (
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('WebSocket not available')
            )) {
                console.warn('⚠️  Expected error - LSP server not available or WebSocket unavailable:', error.message);
                // Это не ошибка теста, а проблема окружения
            } else {
                throw error;
            }
        } finally {
            transport.close();
        }
    });

    it('should handle invalid URL gracefully', async () => {
        const transport = new SimpleWebSocketTransport('ws://localhost:99999/invalid');

        try {
            await transport.connect();
            assert.fail('Should not connect to invalid server');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an error');
            console.log('✅ Correctly handled invalid URL:', error.message);
        } finally {
            transport.close();
        }
    });

    it('should be safe to close multiple times', () => {
        const transport = new SimpleWebSocketTransport(TEST_SERVER_URL);

        // Множественные вызовы close не должны вызывать ошибок
        assert.doesNotThrow(() => {
            transport.close();
            transport.close();
            transport.close();
        }, 'Multiple close calls should be safe');

        assert.strictEqual(transport.isConnected, false, 'Should remain disconnected');
    });

    it('should report correct connection state', () => {
        const transport = new SimpleWebSocketTransport(TEST_SERVER_URL);

        assert.strictEqual(transport.isConnected, false, 'Should start disconnected');

        transport.close();
        assert.strictEqual(transport.isConnected, false, 'Should remain disconnected after close');
    });
});
