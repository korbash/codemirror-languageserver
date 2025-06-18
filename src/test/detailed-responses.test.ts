/**
 * Детальные тесты ответов сервера - для визуального изучения ответов LSP
 * Эти тесты показывают полные ответы сервера в удобочитаемом формате
 */

import assert from 'assert';
import {
    createAndInitializeLanguageServer,
    LanguageServerOptions,
    LanguageServer,
    CompletionParams,
    HoverParams,
    DefinitionParams,
    ReferenceParams,
    DidOpenTextDocumentParams,
} from '../index.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

const LSP_OPTIONS: LanguageServerOptions = {
    name: 'Python LSP Detailed Response Test',
    rootUri: 'file:///test-workspace',
    logging: { level: 'error' },
    request: { timeout: 15000, retries: 1 },
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

const DETAILED_PYTHON_CODE = `# Детальный Python код для изучения LSP ответов
import os
import sys
import json
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class Person:
    """Класс для представления человека"""
    name: str
    age: int
    email: Optional[str] = None

    def get_info(self) -> Dict[str, str]:
        """Получить информацию о человеке"""
        return {
            "name": self.name,
            "age": str(self.age),
            "email": self.email or "не указан"
        }

def calculate_fibonacci(n: int) -> int:
    """
    Вычислить число Фибоначчи

    Args:
        n: Номер числа в последовательности

    Returns:
        Число Фибоначчи

    Raises:
        ValueError: Если n отрицательное
    """
    if n < 0:
        raise ValueError("n должно быть неотрицательным")
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

def process_data(data: List[Dict[str, str]]) -> List[Person]:
    """Обработать данные и создать список людей"""
    people = []
    for item in data:
        person = Person(
            name=item.get("name", "Unknown"),
            age=int(item.get("age", 0)),
            email=item.get("email")
        )
        people.append(person)
    return people

def main():
    """Главная функция"""
    print("Запуск программы...")

    # Тестовые данные
    test_data = [
        {"name": "Иван", "age": "30", "email": "ivan@example.com"},
        {"name": "Мария", "age": "25"},
    ]

    # Обработка данных
    people = process_data(test_data)

    # Вывод информации
    for person in people:
        info = person.get_info()
        print(f"Человек: {info}")

    # Вычисление Фибоначчи
    fib_result = calculate_fibonacci(10)
    print(f"Фибоначчи(10) = {fib_result}")

    # Работа с файлами
    if os.path.exists("config.json"):
        with open("config.json", "r") as f:
            config = json.load(f)
            print(f"Конфигурация: {config}")

if __name__ == "__main__":
    main()
`;

function printSeparator(title: string) {
    console.log('\n' + '='.repeat(80));
    console.log(`🔍 ${title}`);
    console.log('='.repeat(80));
}

function printSubSeparator(title: string) {
    console.log('\n' + '-'.repeat(60));
    console.log(`📋 ${title}`);
    console.log('-'.repeat(60));
}

describe('Детальные ответы LSP сервера', () => {
    describe('Автодополнение - детальный анализ', () => {
        it('должно показать полный ответ автодополнения для импортов', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );
            result.isSuccess();
            result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///detailed_completion.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('АВТОДОПОЛНЕНИЕ ПОСЛЕ "import "');

                        const completionParams: CompletionParams = {
                            textDocument: {
                                uri: 'file:///detailed_completion.py',
                            },
                            position: { line: 1, character: 7 }, // После "import "
                        };

                        const completion =
                            await server.completion(completionParams);

                        await completion.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 1, символ 7 (после "import ")',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (Array.isArray(result)) {
                                    printSubSeparator(
                                        `Найдено ${result.length} вариантов автодополнения`,
                                    );
                                    result.forEach((item, index) => {
                                        console.log(
                                            `\n${index + 1}. ${item.label || item.insertText || 'Без метки'}`,
                                        );
                                        if (item.kind)
                                            console.log(`   Тип: ${item.kind}`);
                                        if (item.detail)
                                            console.log(
                                                `   Детали: ${item.detail}`,
                                            );
                                        if (item.documentation) {
                                            const doc =
                                                typeof item.documentation ===
                                                'string'
                                                    ? item.documentation
                                                    : item.documentation
                                                          .value ||
                                                      JSON.stringify(
                                                          item.documentation,
                                                      );
                                            console.log(
                                                `   Документация: ${doc}`,
                                            );
                                        }
                                        if (item.sortText)
                                            console.log(
                                                `   Сортировка: ${item.sortText}`,
                                            );
                                        if (item.filterText)
                                            console.log(
                                                `   Фильтр: ${item.filterText}`,
                                            );
                                        if (item.insertText)
                                            console.log(
                                                `   Вставка: ${item.insertText}`,
                                            );
                                    });
                                } else if (result && result.items) {
                                    printSubSeparator(
                                        `Найдено ${result.items.length} вариантов автодополнения`,
                                    );
                                    if (result.isIncomplete) {
                                        console.log(
                                            '⚠️  Список неполный (isIncomplete: true)',
                                        );
                                    }
                                    result.items.forEach(
                                        (item: any, index: number) => {
                                            console.log(
                                                `\n${index + 1}. ${item.label || item.insertText || 'Без метки'}`,
                                            );
                                            if (item.kind)
                                                console.log(
                                                    `   Тип: ${item.kind}`,
                                                );
                                            if (item.detail)
                                                console.log(
                                                    `   Детали: ${item.detail}`,
                                                );
                                            if (item.documentation) {
                                                const doc =
                                                    typeof item.documentation ===
                                                    'string'
                                                        ? item.documentation
                                                        : item.documentation
                                                              .value ||
                                                          JSON.stringify(
                                                              item.documentation,
                                                          );
                                                console.log(
                                                    `   Документация: ${doc}`,
                                                );
                                            }
                                            if (item.sortText)
                                                console.log(
                                                    `   Сортировка: ${item.sortText}`,
                                                );
                                            if (item.filterText)
                                                console.log(
                                                    `   Фильтр: ${item.filterText}`,
                                                );
                                            if (item.insertText)
                                                console.log(
                                                    `   Вставка: ${item.insertText}`,
                                                );
                                        },
                                    );
                                }

                                console.log(
                                    '\n✅ Тест автодополнения завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос автодополнения превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка автодополнения:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос автодополнения отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время автодополнения',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации сервера для автодополнения',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста автодополнения',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация сервера отменена для автодополнения',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для автодополнения',
                    );
                },
            });
        });

        it('должно показать автодополнение для методов объекта', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///method_completion.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('АВТОДОПОЛНЕНИЕ ДЛЯ МЕТОДОВ ОБЪЕКТА');

                        const completionParams: CompletionParams = {
                            textDocument: {
                                uri: 'file:///method_completion.py',
                            },
                            position: { line: 52, character: 16 }, // После "person."
                        };

                        const completion =
                            await server.completion(completionParams);

                        await completion.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 52, символ 16 (после "person.")',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                const items = Array.isArray(result)
                                    ? result
                                    : result?.items || [];
                                if (items.length > 0) {
                                    printSubSeparator(
                                        `Методы и атрибуты объекта Person (${items.length})`,
                                    );
                                    items.forEach(
                                        (item: any, index: number) => {
                                            console.log(
                                                `\n${index + 1}. ${item.label || item.insertText || 'Без метки'}`,
                                            );
                                            if (item.kind) {
                                                const kindNames = {
                                                    1: 'Text',
                                                    2: 'Method',
                                                    3: 'Function',
                                                    4: 'Constructor',
                                                    5: 'Field',
                                                    6: 'Variable',
                                                    7: 'Class',
                                                    8: 'Interface',
                                                    9: 'Module',
                                                    10: 'Property',
                                                    11: 'Unit',
                                                    12: 'Value',
                                                };
                                                console.log(
                                                    `   Тип: ${kindNames[item.kind as keyof typeof kindNames] || item.kind}`,
                                                );
                                            }
                                            if (item.detail)
                                                console.log(
                                                    `   Сигнатура: ${item.detail}`,
                                                );
                                            if (item.documentation) {
                                                const doc =
                                                    typeof item.documentation ===
                                                    'string'
                                                        ? item.documentation
                                                        : item.documentation
                                                              .value ||
                                                          JSON.stringify(
                                                              item.documentation,
                                                          );
                                                console.log(
                                                    `   Описание: ${doc}`,
                                                );
                                            }
                                        },
                                    );
                                }

                                console.log(
                                    '\n✅ Тест автодополнения методов завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос автодополнения методов превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка автодополнения методов:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос автодополнения методов отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время автодополнения методов',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для автодополнения методов',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста автодополнения методов',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация отменена для автодополнения методов',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для автодополнения методов',
                    );
                },
            });
        });
    });

    describe('Hover - детальный анализ', () => {
        it('должно показать полную информацию hover для функции', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///hover_function.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('HOVER ИНФОРМАЦИЯ ДЛЯ ФУНКЦИИ');

                        const hoverParams: HoverParams = {
                            textDocument: { uri: 'file:///hover_function.py' },
                            position: { line: 18, character: 15 }, // На имени функции "calculate_fibonacci"
                        };

                        const hover = await server.hover(hoverParams);

                        await hover.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 18, символ 15 (функция calculate_fibonacci)',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (result && result.contents) {
                                    printSubSeparator('Содержимое Hover');

                                    if (typeof result.contents === 'string') {
                                        console.log(
                                            `📝 Текст: ${result.contents}`,
                                        );
                                    } else if (Array.isArray(result.contents)) {
                                        result.contents.forEach(
                                            (content: any, index: number) => {
                                                console.log(
                                                    `\n📝 Элемент ${index + 1}:`,
                                                );
                                                if (
                                                    typeof content === 'string'
                                                ) {
                                                    console.log(
                                                        `   Текст: ${content}`,
                                                    );
                                                } else {
                                                    console.log(
                                                        `   Язык: ${content.language || 'не указан'}`,
                                                    );
                                                    console.log(
                                                        `   Значение: ${content.value || 'пусто'}`,
                                                    );
                                                }
                                            },
                                        );
                                    } else if (result.contents.value) {
                                        console.log(
                                            `📝 Язык: ${result.contents.language || 'не указан'}`,
                                        );
                                        console.log(
                                            `📝 Значение:\n${result.contents.value}`,
                                        );
                                    }

                                    if (result.range) {
                                        printSubSeparator('Диапазон Hover');
                                        console.log(
                                            `📍 Начало: строка ${result.range.start.line}, символ ${result.range.start.character}`,
                                        );
                                        console.log(
                                            `📍 Конец: строка ${result.range.end.line}, символ ${result.range.end.character}`,
                                        );
                                        console.log(
                                            `📏 Длина: ${result.range.end.character - result.range.start.character} символов`,
                                        );
                                    }
                                }

                                console.log(
                                    '\n✅ Тест hover для функции завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос hover превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn('❌ Ошибка hover:', error.message);
                            },
                            cancelled: async () => {
                                console.warn('🚫 Запрос hover отменен');
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время hover',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для hover функции',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста hover функции',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация отменена для hover функции',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для hover функции',
                    );
                },
            });
        });

        it('должно показать hover для класса и его атрибутов', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///hover_class.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('HOVER ИНФОРМАЦИЯ ДЛЯ КЛАССА');

                        const hoverParams: HoverParams = {
                            textDocument: { uri: 'file:///hover_class.py' },
                            position: { line: 7, character: 10 }, // На имени класса "Person"
                        };

                        const hover = await server.hover(hoverParams);

                        await hover.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 7, символ 10 (класс Person)',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (result && result.contents) {
                                    printSubSeparator('Информация о классе');

                                    if (typeof result.contents === 'string') {
                                        console.log(
                                            `📝 Описание класса: ${result.contents}`,
                                        );
                                    } else if (Array.isArray(result.contents)) {
                                        result.contents.forEach(
                                            (content: any, index: number) => {
                                                console.log(
                                                    `\n📝 Блок ${index + 1}:`,
                                                );
                                                if (
                                                    typeof content === 'string'
                                                ) {
                                                    console.log(
                                                        `   ${content}`,
                                                    );
                                                } else {
                                                    if (content.language)
                                                        console.log(
                                                            `   Язык: ${content.language}`,
                                                        );
                                                    if (content.value)
                                                        console.log(
                                                            `   Код:\n${content.value}`,
                                                        );
                                                }
                                            },
                                        );
                                    } else if (result.contents.value) {
                                        console.log(
                                            `📝 Язык: ${result.contents.language || 'не указан'}`,
                                        );
                                        console.log(
                                            `📝 Определение класса:\n${result.contents.value}`,
                                        );
                                    }
                                }

                                console.log(
                                    '\n✅ Тест hover для класса завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос hover для класса превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка hover для класса:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос hover для класса отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время hover для класса',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для hover класса',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста hover класса',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn('⚠️  Инициализация отменена для hover класса');
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для hover класса',
                    );
                },
            });
        });
    });

    describe('Go to Definition - детальный анализ', () => {
        it('должно показить информацию о переходе к определению', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///goto_definition.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('GO TO DEFINITION ИНФОРМАЦИЯ');

                        const definitionParams: DefinitionParams = {
                            textDocument: { uri: 'file:///goto_definition.py' },
                            position: { line: 58, character: 17 }, // На вызове "calculate_fibonacci"
                        };

                        const definition =
                            await server.definition(definitionParams);

                        await definition.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 58, символ 17 (вызов calculate_fibonacci)',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (result) {
                                    const locations = Array.isArray(result)
                                        ? result
                                        : [result];
                                    printSubSeparator(
                                        `Найдено ${locations.length} определений`,
                                    );

                                    locations.forEach(
                                        (location: any, index: number) => {
                                            console.log(
                                                `\n📍 Определение ${index + 1}:`,
                                            );
                                            if (location.uri)
                                                console.log(
                                                    `   URI: ${location.uri}`,
                                                );
                                            if (location.range) {
                                                console.log(
                                                    `   Начало: строка ${location.range.start.line}, символ ${location.range.start.character}`,
                                                );
                                                console.log(
                                                    `   Конец: строка ${location.range.end.line}, символ ${location.range.end.character}`,
                                                );
                                            }
                                        },
                                    );
                                }

                                console.log(
                                    '\n✅ Тест go to definition завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос go to definition превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка go to definition:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос go to definition отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время go to definition',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для go to definition',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста go to definition',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация отменена для go to definition',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для go to definition',
                    );
                },
            });
        });
    });

    describe('Find References - детальный анализ', () => {
        it('должно показать все ссылки на функцию', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///find_references.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('FIND REFERENCES ДЛЯ ФУНКЦИИ');

                        const referencesParams: ReferenceParams = {
                            textDocument: { uri: 'file:///find_references.py' },
                            position: { line: 18, character: 15 }, // На определении функции "calculate_fibonacci"
                            context: {
                                includeDeclaration: true, // Включить определение в результаты
                            },
                        };

                        const references =
                            await server.references(referencesParams);

                        await references.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Pozиция запроса: строка 18, символ 15 (функция calculate_fibonacci)',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (result && Array.isArray(result)) {
                                    printSubSeparator(
                                        `Найдено ${result.length} ссылок на функцию`,
                                    );

                                    result.forEach(
                                        (reference: any, index: number) => {
                                            console.log(
                                                `\n📍 Ссылка ${index + 1}:`,
                                            );
                                            if (reference.uri) {
                                                console.log(
                                                    `   URI: ${reference.uri}`,
                                                );
                                            }
                                            if (reference.range) {
                                                console.log(
                                                    `   Начало: строка ${reference.range.start.line}, символ ${reference.range.start.character}`,
                                                );
                                                console.log(
                                                    `   Конец: строка ${reference.range.end.line}, символ ${reference.range.end.character}`,
                                                );
                                            }

                                            // Попробуем определить тип ссылки
                                            const isDeclaration =
                                                index === 0 &&
                                                referencesParams.context
                                                    .includeDeclaration;
                                            console.log(
                                                `   Тип: ${isDeclaration ? 'Определение' : 'Использование'}`,
                                            );
                                        },
                                    );

                                    // Статистика
                                    const declarations = result.filter(
                                        (ref: any, idx: number) =>
                                            idx === 0 &&
                                            referencesParams.context
                                                .includeDeclaration,
                                    );
                                    const usages =
                                        result.length - declarations.length;

                                    printSubSeparator('Статистика ссылок');
                                    console.log(
                                        `📊 Всего ссылок: ${result.length}`,
                                    );
                                    console.log(
                                        `📝 Определений: ${declarations.length}`,
                                    );
                                    console.log(`🔗 Использований: ${usages}`);
                                } else if (
                                    result === null ||
                                    result.length === 0
                                ) {
                                    console.log('📭 Ссылки не найдены');
                                }

                                console.log(
                                    '\n✅ Тест find references завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос find references превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка find references:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос find references отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время find references',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для find references',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста find references',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация отменена для find references',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для find references',
                    );
                },
            });
        });

        it('должно показать ссылки на переменную/параметр', async () => {
            const result = await createAndInitializeLanguageServer(
                TEST_SERVER_URL,
                LSP_OPTIONS,
            );

            await result.handleResult({
                success: async (server: LanguageServer) => {
                    try {
                        await server.notifyDidOpenTextDocument({
                            textDocument: {
                                uri: 'file:///find_var_references.py',
                                languageId: 'python',
                                version: 1,
                                text: DETAILED_PYTHON_CODE,
                            },
                        });

                        printSeparator('FIND REFERENCES ДЛЯ ПЕРЕМЕННОЙ');

                        const referencesParams: ReferenceParams = {
                            textDocument: {
                                uri: 'file:///find_var_references.py',
                            },
                            position: { line: 50, character: 8 }, // На переменной "people"
                            context: {
                                includeDeclaration: true,
                            },
                        };

                        const references =
                            await server.references(referencesParams);

                        await references.handleResult({
                            success: (result: any) => {
                                console.log(
                                    '🎯 Позиция запроса: строка 50, символ 8 (переменная people)',
                                );
                                console.log('\n📦 ПОЛНЫЙ JSON ОТВЕТ:');
                                console.log(JSON.stringify(result, null, 2));

                                if (result && Array.isArray(result)) {
                                    printSubSeparator(
                                        `Найдено ${result.length} ссылок на переменную`,
                                    );

                                    result.forEach(
                                        (reference: any, index: number) => {
                                            console.log(
                                                `\n📍 Ссылка ${index + 1}:`,
                                            );
                                            if (reference.uri) {
                                                console.log(
                                                    `   URI: ${reference.uri}`,
                                                );
                                            }
                                            if (reference.range) {
                                                console.log(
                                                    `   Позиция: строка ${reference.range.start.line}, символы ${reference.range.start.character}-${reference.range.end.character}`,
                                                );
                                            }
                                        },
                                    );
                                }

                                console.log(
                                    '\n✅ Тест find references для переменной завершен',
                                );
                            },
                            timeout: async () => {
                                console.warn(
                                    '⏰ Запрос find references для переменной превысил время ожидания',
                                );
                            },
                            error: async (error: Error) => {
                                console.warn(
                                    '❌ Ошибка find references для переменной:',
                                    error.message,
                                );
                            },
                            cancelled: async () => {
                                console.warn(
                                    '🚫 Запрос find references для переменной отменен',
                                );
                            },
                            connectionReset: async () => {
                                console.warn(
                                    '💔 Соединение сброшено во время find references для переменной',
                                );
                            },
                        });
                    } finally {
                        server.dispose();
                    }
                },
                timeout: async () => {
                    console.warn(
                        '⚠️  Время ожидания инициализации для find references переменной',
                    );
                },
                error: async (error: Error) => {
                    if (error.message.includes('ECONNREFUSED')) {
                        console.warn(
                            '⚠️  LSP сервер недоступен для теста find references переменной',
                        );
                        return;
                    }
                    throw error;
                },
                cancelled: async () => {
                    console.warn(
                        '⚠️  Инициализация отменена для find references переменной',
                    );
                },
                connectionReset: async () => {
                    console.warn(
                        '⚠️  Соединение сброшено при инициализации для find references переменной',
                    );
                },
            });
        });
    });
});
