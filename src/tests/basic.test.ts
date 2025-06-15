/**
 * Базовые тесты для WebSocket LSP транспорта
 * Супер простые тесты для проверки основной функциональности
 */

import { WebSocketTransport } from '../transports/WebSocketTransport.js';
import * as LSP from 'vscode-languageserver-protocol';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';
const TIMEOUT = 10000; // 10 секунд

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
}

class BasicTester {
    private results: TestResult[] = [];

    async runAll(): Promise<void> {
        console.log('🚀 Запуск базовых тестов LSP транспорта...\n');

        await this.test('Подключение к WebSocket', () => this.testConnection());
        await this.test('Инициализация LSP', () => this.testInitialization());
        await this.test('Получение capabilities', () =>
            this.testCapabilities(),
        );
        await this.test('Обработка ошибок', () => this.testErrorHandling());

        this.printResults();
    }

    private async test(
        name: string,
        testFn: () => Promise<void>,
    ): Promise<void> {
        const start = Date.now();
        console.log(`⏳ ${name}...`);

        try {
            await testFn();
            const duration = Date.now() - start;
            this.results.push({ name, passed: true, duration });
            console.log(`✅ ${name} - ПРОШЕЛ (${duration}ms)\n`);
        } catch (error) {
            const duration = Date.now() - start;
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            this.results.push({
                name,
                passed: false,
                error: errorMsg,
                duration,
            });
            console.log(`❌ ${name} - ПРОВАЛЕН: ${errorMsg} (${duration}ms)\n`);
        }
    }

    /**
     * Тест 1: Базовое подключение к WebSocket
     */
    private async testConnection(): Promise<void> {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();

            if (!transport.isConnected) {
                throw new Error('Транспорт показывает что не подключен');
            }

            console.log('  ✓ WebSocket подключен');
            console.log('  ✓ Транспорт в состоянии connected');
        } finally {
            transport.close();
        }
    }

    /**
     * Тест 2: LSP инициализация
     */
    private async testInitialization(): Promise<void> {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            const connection = transport.connection;

            const initResult = await connection.sendRequest(
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

            if (!initResult) {
                throw new Error('Нет ответа на initialize');
            }

            if (!initResult.capabilities) {
                throw new Error('Сервер не вернул capabilities');
            }

            console.log('  ✓ Initialize запрос успешен');
            console.log('  ✓ Получены server capabilities');

            // Отправляем initialized notification
            await connection.sendNotification(
                LSP.InitializedNotification.type,
                {},
            );
            console.log('  ✓ Initialized notification отправлен');
        } finally {
            transport.close();
        }
    }

    /**
     * Тест 3: Проверка capabilities сервера
     */
    private async testCapabilities(): Promise<void> {
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

            if (capabilityKeys.length === 0) {
                throw new Error('Сервер не предоставил никаких capabilities');
            }

            console.log(`  ✓ Получено ${capabilityKeys.length} capabilities:`);
            capabilityKeys.slice(0, 5).forEach((key) => {
                console.log(`    - ${key}`);
            });

            if (capabilityKeys.length > 5) {
                console.log(`    ... и еще ${capabilityKeys.length - 5}`);
            }

            if (result.serverInfo) {
                console.log(
                    `  ✓ Сервер: ${result.serverInfo.name} v${result.serverInfo.version}`,
                );
            }
        } finally {
            transport.close();
        }
    }

    /**
     * Тест 4: Обработка ошибок
     */
    private async testErrorHandling(): Promise<void> {
        // Тест неверного URL
        try {
            const badTransport = new WebSocketTransport('ws://localhost:99999');
            await badTransport.connect();
            throw new Error('Должна была быть ошибка подключения');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('Должна была быть ошибка')
            ) {
                throw error;
            }
            console.log('  ✓ Правильно обработана ошибка подключения');
        }

        // Тест использования connection до подключения
        try {
            const transport = new WebSocketTransport(TEST_SERVER_URL);
            transport.connection; // Должно выбросить ошибку
            throw new Error('Должна была быть ошибка при получении connection');
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('Должна была быть ошибка')
            ) {
                throw error;
            }
            console.log(
                '  ✓ Правильно обработана ошибка использования до подключения',
            );
        }

        // Тест повторного подключения
        const transport = new WebSocketTransport(TEST_SERVER_URL);
        try {
            await transport.connect();

            try {
                await transport.connect(); // Должно выбросить ошибку
                throw new Error(
                    'Должна была быть ошибка повторного подключения',
                );
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes('Должна была быть ошибка')
                ) {
                    throw error;
                }
                console.log(
                    '  ✓ Правильно обработана ошибка повторного подключения',
                );
            }
        } finally {
            transport.close();
        }
    }

    private printResults(): void {
        console.log('\n🏁 РЕЗУЛЬТАТЫ ТЕСТОВ');
        console.log('='.repeat(50));

        const passed = this.results.filter((r) => r.passed).length;
        const total = this.results.length;

        this.results.forEach((result) => {
            const status = result.passed ? '✅ ПРОШЕЛ' : '❌ ПРОВАЛЕН';
            const duration = result.duration ? `${result.duration}ms` : 'N/A';
            console.log(`${status} - ${result.name} (${duration})`);

            if (!result.passed && result.error) {
                console.log(`    Ошибка: ${result.error}`);
            }
        });

        console.log('='.repeat(50));
        console.log(`📊 Итого: ${passed}/${total} тестов прошли успешно`);

        if (passed === total) {
            console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Код работает адекватно.');
        } else {
            console.log('⚠️  Есть проблемы, требующие внимания.');
        }
    }
}

/**
 * Быстрый тест - только подключение и инициализация
 */
export async function quickTest(): Promise<boolean> {
    console.log('⚡ Быстрый тест подключения...');

    const transport = new WebSocketTransport(TEST_SERVER_URL);

    try {
        await transport.connect();
        console.log('✅ Подключение OK');

        const connection = transport.connection;
        const result = await connection.sendRequest(
            LSP.InitializeRequest.type,
            {
                processId: null,
                rootUri: 'file:///test',
                capabilities: {},
            },
        );

        console.log('✅ Инициализация OK');
        console.log(
            `📋 Capabilities: ${Object.keys(result.capabilities).length}`,
        );

        return true;
    } catch (error) {
        console.log(
            '❌ Ошибка:',
            error instanceof Error ? error.message : error,
        );
        return false;
    } finally {
        transport.close();
    }
}

// Если файл запущен напрямую
if (typeof require !== 'undefined' && require.main === module) {
    const tester = new BasicTester();
    tester.runAll().catch(console.error);
}

export default BasicTester;
