/**
 * Демонстрационный тест для проверки ответов LSP сервера
 * Простой тест с отладочными сообщениями для визуального изучения ответов
 */

import assert from 'assert';
import {
    createAndInitializeLanguageServer,
    LanguageServerOptions,
    LanguageServer,
    CompletionParams,
    HoverParams,
} from '../index.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

const LSP_OPTIONS: LanguageServerOptions = {
    name: 'Demo LSP Response Test',
    rootUri: 'file:///demo-workspace',
    logging: { level: 'info' },
    request: { timeout: 10000, retries: 1 },
    connection: { reconnectAttempts: 1, reconnectDelay: 1000 },
    initializationOptions: {
        settings: {
            python: {
                analysis: {
                    typeCheckingMode: 'basic',
                },
            },
        },
    },
};

const SIMPLE_PYTHON_CODE = `import os
import sys
def hello_world():
    print("Hello, World!")
    return "success"
`;

describe('🎯 Демонстрация ответов LSP сервера', () => {
    it('должно показать автодополнение после "import "', async () => {
        console.log('\n🚀 Начинаем тест автодополнения...');

        const result = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            LSP_OPTIONS,
        );

        await result.handleResult({
            success: async (server: LanguageServer) => {
                console.log('✅ Сервер успешно инициализирован');

                try {
                    // Открываем документ
                    console.log('📄 Открываем документ...');
                    await server.notifyDidOpenTextDocument({
                        textDocument: {
                            uri: 'file:///demo.py',
                            languageId: 'python',
                            version: 1,
                            text: SIMPLE_PYTHON_CODE,
                        },
                    });
                    console.log('✅ Документ открыт');

                    // Запрашиваем автодополнение
                    console.log(
                        '🔍 Запрашиваем автодополнение после "import "...',
                    );
                    const completionParams: CompletionParams = {
                        textDocument: { uri: 'file:///demo.py' },
                        position: { line: 0, character: 7 }, // После "import "
                    };

                    const completion =
                        await server.completion(completionParams);
                    console.log('📨 Получили ответ от сервера');

                    await completion.handleResult({
                        success: (result: any) => {
                            console.log('\n' + '='.repeat(80));
                            console.log('🎉 УСПЕШНЫЙ ОТВЕТ ОТ СЕРВЕРА!');
                            console.log('='.repeat(80));
                            console.log('📦 Тип результата:', typeof result);
                            console.log(
                                '📦 Является массивом:',
                                Array.isArray(result),
                            );
                            console.log('📦 Полный JSON ответ:');
                            console.log(JSON.stringify(result, null, 2));
                            console.log('='.repeat(80));

                            if (Array.isArray(result) && result.length > 0) {
                                console.log(
                                    `\n📋 Найдено ${result.length} вариантов автодополнения:`,
                                );
                                result.slice(0, 5).forEach((item, index) => {
                                    console.log(
                                        `  ${index + 1}. ${item.label || item.insertText || JSON.stringify(item)}`,
                                    );
                                });
                            } else if (
                                result &&
                                result.items &&
                                result.items.length > 0
                            ) {
                                console.log(
                                    `\n📋 Найдено ${result.items.length} вариантов автодополнения:`,
                                );
                                result.items
                                    .slice(0, 5)
                                    .forEach((item: any, index: number) => {
                                        console.log(
                                            `  ${index + 1}. ${item.label || item.insertText || JSON.stringify(item)}`,
                                        );
                                    });
                            } else {
                                console.log(
                                    '\n⚠️  Автодополнение не вернуло результатов',
                                );
                                console.log('Возможные причины:');
                                console.log('- Позиция курсора некорректна');
                                console.log(
                                    '- Сервер не поддерживает автодополнение в данной позиции',
                                );
                                console.log(
                                    '- Контекст недостаточен для автодополнения',
                                );
                            }
                        },
                        timeout: async () => {
                            console.log('⏰ Таймаут автодополнения');
                        },
                        error: async (error: Error) => {
                            console.log(
                                '❌ Ошибка автодополнения:',
                                error.message,
                            );
                            console.log('Стек ошибки:', error.stack);
                        },
                        cancelled: async () => {
                            console.log('🚫 Автодополнение отменено');
                        },
                        connectionReset: async () => {
                            console.log('💔 Соединение сброшено');
                        },
                    });
                } finally {
                    console.log('🧹 Закрываем соединение с сервером...');
                    server.dispose();
                    console.log('✅ Соединение закрыто');
                }
            },
            timeout: async () => {
                console.log('⏰ Таймаут инициализации сервера');
            },
            error: async (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log(
                        '⚠️  LSP сервер недоступен на',
                        TEST_SERVER_URL,
                    );
                    console.log('Убедитесь, что сервер запущен и доступен');
                    return;
                }
                console.log('❌ Ошибка инициализации:', error.message);
                throw error;
            },
            cancelled: async () => {
                console.log('🚫 Инициализация отменена');
            },
            connectionReset: async () => {
                console.log('💔 Соединение сброшено при инициализации');
            },
        });
    });

    it('должно показать hover информацию для функции', async () => {
        console.log('\n🚀 Начинаем тест hover...');

        const result = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            LSP_OPTIONS,
        );

        await result.handleResult({
            success: async (server: LanguageServer) => {
                console.log('✅ Сервер успешно инициализирован');

                try {
                    // Открываем документ
                    console.log('📄 Открываем документ...');
                    await server.notifyDidOpenTextDocument({
                        textDocument: {
                            uri: 'file:///hover_demo.py',
                            languageId: 'python',
                            version: 1,
                            text: SIMPLE_PYTHON_CODE,
                        },
                    });
                    console.log('✅ Документ открыт');

                    // Запрашиваем hover
                    console.log(
                        '🔍 Запрашиваем hover для функции hello_world...',
                    );
                    const hoverParams: HoverParams = {
                        textDocument: { uri: 'file:///hover_demo.py' },
                        position: { line: 2, character: 8 }, // На имени функции "hello_world"
                    };

                    const hover = await server.hover(hoverParams);
                    console.log('📨 Получили ответ hover от сервера');

                    await hover.handleResult({
                        success: (result: any) => {
                            console.log('\n' + '='.repeat(80));
                            console.log('🎉 УСПЕШНЫЙ HOVER ОТВЕТ ОТ СЕРВЕРА!');
                            console.log('='.repeat(80));
                            console.log('📦 Тип результата:', typeof result);
                            console.log('📦 Полный JSON ответ:');
                            console.log(JSON.stringify(result, null, 2));
                            console.log('='.repeat(80));

                            if (result && result.contents) {
                                console.log('\n📋 Содержимое hover:');
                                if (typeof result.contents === 'string') {
                                    console.log('  Текст:', result.contents);
                                } else if (Array.isArray(result.contents)) {
                                    result.contents.forEach(
                                        (content: any, index: number) => {
                                            console.log(
                                                `  Элемент ${index + 1}:`,
                                                content,
                                            );
                                        },
                                    );
                                } else if (result.contents.value) {
                                    console.log(
                                        '  Язык:',
                                        result.contents.language || 'не указан',
                                    );
                                    console.log(
                                        '  Значение:',
                                        result.contents.value,
                                    );
                                }

                                if (result.range) {
                                    console.log('\n📍 Диапазон hover:');
                                    console.log(
                                        `  Начало: строка ${result.range.start.line}, символ ${result.range.start.character}`,
                                    );
                                    console.log(
                                        `  Конец: строка ${result.range.end.line}, символ ${result.range.end.character}`,
                                    );
                                }
                            } else {
                                console.log('\n⚠️  Hover не вернул содержимое');
                            }
                        },
                        timeout: async () => {
                            console.log('⏰ Таймаут hover');
                        },
                        error: async (error: Error) => {
                            console.log('❌ Ошибка hover:', error.message);
                        },
                        cancelled: async () => {
                            console.log('🚫 Hover отменен');
                        },
                        connectionReset: async () => {
                            console.log('💔 Соединение сброшено');
                        },
                    });
                } finally {
                    console.log('🧹 Закрываем соединение с сервером...');
                    server.dispose();
                    console.log('✅ Соединение закрыто');
                }
            },
            timeout: async () => {
                console.log('⏰ Таймаут инициализации сервера');
            },
            error: async (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log(
                        '⚠️  LSP сервер недоступен на',
                        TEST_SERVER_URL,
                    );
                    return;
                }
                console.log('❌ Ошибка инициализации:', error.message);
                throw error;
            },
            cancelled: async () => {
                console.log('🚫 Инициализация отменена');
            },
            connectionReset: async () => {
                console.log('💔 Соединение сброшено при инициализации');
            },
        });
    });
});
