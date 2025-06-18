/**
 * Отладочные тесты для изучения ответов LSP сервера
 * Максимально простые тесты с подробным логированием
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
    name: 'Debug LSP Response Test',
    rootUri: 'file:///debug-workspace',
    logging: { level: 'debug' },
    request: { timeout: 10000, retries: 1 },
    connection: { reconnectAttempts: 1, reconnectDelay: 1000 },
};

const DEBUG_PYTHON_CODE = `import sys
import os
def test():
    return 42
`;

function logSeparator(title: string) {
    console.log('\n' + '='.repeat(100));
    console.log(`🔍 ${title}`);
    console.log('='.repeat(100));
}

function logStep(step: string) {
    console.log(`\n📋 ${step}`);
}

describe('🐛 Отладка ответов LSP сервера', () => {
    it('отладка автодополнения с полным логированием', async function() {
        this.timeout(15000);

        logSeparator('ОТЛАДКА АВТОДОПОЛНЕНИЯ');

        logStep('Шаг 1: Создание и инициализация сервера');
        const result = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            LSP_OPTIONS,
        );

        logStep('Шаг 2: Обработка результата инициализации');
        await result.match({
            success: async (server: LanguageServer) => {
                console.log('✅ Сервер успешно инициализирован');

                try {
                    logStep('Шаг 3: Открытие документа');
                    await server.notifyDidOpenTextDocument({
                        textDocument: {
                            uri: 'file:///debug_completion.py',
                            languageId: 'python',
                            version: 1,
                            text: DEBUG_PYTHON_CODE,
                        },
                    });
                    console.log('✅ Документ открыт успешно');
                    console.log('📄 Содержимое документа:');
                    DEBUG_PYTHON_CODE.split('\n').forEach((line, index) => {
                        console.log(`   ${index}: ${line}`);
                    });

                    logStep('Шаг 4: Создание параметров автодополнения');
                    const completionParams: CompletionParams = {
                        textDocument: { uri: 'file:///debug_completion.py' },
                        position: { line: 0, character: 7 }, // После "import "
                    };
                    console.log('🎯 Параметры запроса:');
                    console.log(JSON.stringify(completionParams, null, 2));

                    logStep('Шаг 5: Отправка запроса автодополнения');
                    console.log('📤 Отправляем запрос на автодополнение...');

                    const completion = await server.completion(completionParams);
                    console.log('📥 Получен ответ от сервера');

                    logStep('Шаг 6: Обработка ответа автодополнения');
                    await completion.match({
                        success: (result: any) => {
                            logSeparator('УСПЕШНЫЙ ОТВЕТ АВТОДОПОЛНЕНИЯ');

                            console.log('📊 Анализ ответа:');
                            console.log(`   - Тип: ${typeof result}`);
                            console.log(`   - Конструктор: ${result?.constructor?.name || 'undefined'}`);
                            console.log(`   - Является массивом: ${Array.isArray(result)}`);
                            console.log(`   - Является null: ${result === null}`);
                            console.log(`   - Является undefined: ${result === undefined}`);

                            console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                            try {
                                console.log(JSON.stringify(result, null, 4));
                            } catch (e) {
                                console.log('❌ Ошибка сериализации JSON:', e);
                                console.log('🔍 Попытка вывода через console.log:');
                                console.log(result);
                            }

                            console.log('\n🔍 ДЕТАЛЬНЫЙ АНАЛИЗ:');
                            if (result === null) {
                                console.log('❌ Результат равен null - автодополнение не доступно');
                            } else if (result === undefined) {
                                console.log('❌ Результат undefined - возможная ошибка');
                            } else if (Array.isArray(result)) {
                                console.log(`✅ Результат - массив с ${result.length} элементами`);
                                if (result.length > 0) {
                                    console.log('📋 Первые элементы:');
                                    result.slice(0, 3).forEach((item, index) => {
                                        console.log(`   ${index + 1}. ${JSON.stringify(item, null, 2)}`);
                                    });
                                } else {
                                    console.log('⚠️  Массив пустой');
                                }
                            } else if (typeof result === 'object' && result.items) {
                                console.log(`✅ Результат - объект CompletionList с ${result.items.length} элементами`);
                                console.log(`   isIncomplete: ${result.isIncomplete}`);
                                if (result.items.length > 0) {
                                    console.log('📋 Первые элементы:');
                                    result.items.slice(0, 3).forEach((item: any, index: number) => {
                                        console.log(`   ${index + 1}. ${JSON.stringify(item, null, 2)}`);
                                    });
                                } else {
                                    console.log('⚠️  Массив items пустой');
                                }
                            } else {
                                console.log('❓ Неожиданный формат результата');
                                console.log('🔍 Свойства объекта:');
                                if (typeof result === 'object') {
                                    Object.keys(result).forEach(key => {
                                        console.log(`   ${key}: ${typeof result[key]}`);
                                    });
                                }
                            }

                            console.log('\n✅ Обработка автодополнения завершена');
                        },
                        timeout: async () => {
                            console.log('⏰ ТАЙМАУТ: Запрос автодополнения превысил время ожидания');
                        },
                        error: async (error: Error) => {
                            logSeparator('ОШИБКА АВТОДОПОЛНЕНИЯ');
                            console.log('❌ Тип ошибки:', error.constructor.name);
                            console.log('❌ Сообщение:', error.message);
                            console.log('❌ Стек:', error.stack);
                        },
                        cancelled: async () => {
                            console.log('🚫 ОТМЕНА: Запрос автодополнения был отменен');
                        },
                        connectionReset: async () => {
                            console.log('💔 СБРОС СОЕДИНЕНИЯ: Соединение сброшено во время автодополнения');
                        },
                    });

                } catch (error) {
                    console.log('💥 Исключение в тесте:', error);
                } finally {
                    logStep('Шаг 7: Закрытие соединения');
                    server.dispose();
                    console.log('🧹 Соединение закрыто');
                }
            },
            timeout: async () => {
                console.log('⏰ ТАЙМАУТ ИНИЦИАЛИЗАЦИИ: Превышено время ожидания инициализации сервера');
            },
            error: async (error: Error) => {
                logSeparator('ОШИБКА ИНИЦИАЛИЗАЦИИ');
                console.log('❌ Тип ошибки:', error.constructor.name);
                console.log('❌ Сообщение:', error.message);
                if (error.message.includes('ECONNREFUSED')) {
                    console.log('🔌 LSP сервер недоступен на адресе:', TEST_SERVER_URL);
                    console.log('💡 Убедитесь, что сервер запущен и слушает указанный порт');
                    return; // Не бросаем ошибку для недоступного сервера
                }
                console.log('❌ Стек:', error.stack);
                throw error;
            },
            cancelled: async () => {
                console.log('🚫 ОТМЕНА ИНИЦИАЛИЗАЦИИ: Инициализация сервера была отменена');
            },
            connectionReset: async () => {
                console.log('💔 СБРОС ПРИ ИНИЦИАЛИЗАЦИИ: Соединение сброшено при инициализации');
            },
        });
    });

    it('отладка hover с полным логированием', async function() {
        this.timeout(15000);

        logSeparator('ОТЛАДКА HOVER');

        const result = await createAndInitializeLanguageServer(
            TEST_SERVER_URL,
            LSP_OPTIONS,
        );

        await result.match({
            success: async (server: LanguageServer) => {
                console.log('✅ Сервер успешно инициализирован для hover');

                try {
                    await server.notifyDidOpenTextDocument({
                        textDocument: {
                            uri: 'file:///debug_hover.py',
                            languageId: 'python',
                            version: 1,
                            text: DEBUG_PYTHON_CODE,
                        },
                    });
                    console.log('✅ Документ открыт для hover');

                    const hoverParams: HoverParams = {
                        textDocument: { uri: 'file:///debug_hover.py' },
                        position: { line: 2, character: 4 }, // На слове "test"
                    };
                    console.log('🎯 Параметры hover:');
                    console.log(JSON.stringify(hoverParams, null, 2));

                    console.log('📤 Отправляем запрос hover...');
                    const hover = await server.hover(hoverParams);
                    console.log('📥 Получен ответ hover от сервера');

                    await hover.match({
                        success: (result: any) => {
                            logSeparator('УСПЕШНЫЙ ОТВЕТ HOVER');

                            console.log('📊 Анализ hover ответа:');
                            console.log(`   - Тип: ${typeof result}`);
                            console.log(`   - Конструктор: ${result?.constructor?.name || 'undefined'}`);
                            console.log(`   - Является null: ${result === null}`);
                            console.log(`   - Является undefined: ${result === undefined}`);

                            console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ HOVER:');
                            try {
                                console.log(JSON.stringify(result, null, 4));
                            } catch (e) {
                                console.log('❌ Ошибка сериализации JSON:', e);
                                console.log('🔍 Прямой вывод:');
                                console.log(result);
                            }

                            console.log('\n🔍 ДЕТАЛЬНЫЙ АНАЛИЗ HOVER:');
                            if (result === null) {
                                console.log('❌ Hover результат null - информация недоступна');
                            } else if (result === undefined) {
                                console.log('❌ Hover результат undefined');
                            } else if (typeof result === 'object' && result.contents) {
                                console.log('✅ Hover содержит информацию');
                                console.log('📋 Содержимое contents:');
                                console.log(JSON.stringify(result.contents, null, 2));

                                if (result.range) {
                                    console.log('📍 Диапазон hover:');
                                    console.log(`   Начало: ${result.range.start.line}:${result.range.start.character}`);
                                    console.log(`   Конец: ${result.range.end.line}:${result.range.end.character}`);
                                }
                            } else {
                                console.log('❓ Неожиданный формат hover результата');
                                if (typeof result === 'object') {
                                    console.log('🔍 Доступные свойства:');
                                    Object.keys(result).forEach(key => {
                                        console.log(`   ${key}: ${typeof result[key]}`);
                                    });
                                }
                            }

                            console.log('\n✅ Обработка hover завершена');
                        },
                        timeout: async () => {
                            console.log('⏰ ТАЙМАУТ HOVER: Запрос hover превысил время ожидания');
                        },
                        error: async (error: Error) => {
                            logSeparator('ОШИБКА HOVER');
                            console.log('❌ Тип ошибки hover:', error.constructor.name);
                            console.log('❌ Сообщение hover:', error.message);
                            console.log('❌ Стек hover:', error.stack);
                        },
                        cancelled: async () => {
                            console.log('🚫 ОТМЕНА HOVER: Запрос hover отменен');
                        },
                        connectionReset: async () => {
                            console.log('💔 СБРОС СОЕДИНЕНИЯ HOVER');
                        },
                    });

                } catch (error) {
                    console.log('💥 Исключение в hover тесте:', error);
                } finally {
                    server.dispose();
                    console.log('🧹 Hover соединение закрыто');
                }
            },
            timeout: async () => {
                console.log('⏰ ТАЙМАУТ инициализации для hover');
            },
            error: async (error: Error) => {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log('🔌 LSP сервер недоступен для hover тестов');
                    return;
                }
                throw error;
            },
            cancelled: async () => {
                console.log('🚫 Инициализация для hover отменена');
            },
            connectionReset: async () => {
                console.log('💔 Соединение сброшено при инициализации hover');
            },
        });
    });
});
