# Тестирование CodeMirror Language Server

Этот документ описывает как тестировать WebSocket транспорт для Language Server Protocol (LSP).

## Быстрая проверка

Для самой простой проверки работоспособности:

```bash
npm run sanity
```

Этот тест проверяет только базовое WebSocket подключение.

## Основные тесты

### Быстрый тест

```bash
npm run test:quick
```

Выполняет минимальную проверку:
- WebSocket подключение
- LSP инициализация
- Получение server capabilities

### Полное тестирование

```bash
npm run test
# или
npm run test:full
```

Выполняет все тесты:
- Подключение к WebSocket
- Инициализация LSP
- Проверка capabilities сервера
- Обработка ошибок

## Настройка тестового сервера

Тесты подключаются к Python LSP серверу на `ws://127.0.0.1:8000/lsp/python`.

Для запуска тестового сервера необходимо:

1. Убедиться что Python LSP сервер запущен на порту 8000
2. WebSocket endpoint доступен по адресу `/lsp/python`

## Структура тестов

### sanity-check.ts
Самый простой тест - только проверка подключения к WebSocket.

### basic.test.ts
Основные тесты функциональности:

1. **testConnection()** - проверка WebSocket подключения
2. **testInitialization()** - LSP инициализация и получение capabilities
3. **testCapabilities()** - детальная проверка server capabilities
4. **testErrorHandling()** - обработка различных ошибок:
   - Неверный URL сервера
   - Использование connection до подключения
   - Повторное подключение

### run-tests.ts
Runner для запуска тестов с поддержкой флагов.

## Интерпретация результатов

### Успешный результат
```
✅ ПРОШЕЛ - Подключение к WebSocket (150ms)
✅ ПРОШЕЛ - Инициализация LSP (320ms)
✅ ПРОШЕЛ - Получение capabilities (280ms)
✅ ПРОШЕЛ - Обработка ошибок (450ms)

📊 Итого: 4/4 тестов прошли успешно
🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Код работает адекватно.
```

### Результат с ошибками
```
✅ ПРОШЕЛ - Подключение к WebSocket (150ms)
❌ ПРОВАЛЕН - Инициализация LSP (1200ms)
    Ошибка: WebSocket connection timeout after 10000ms

📊 Итого: 1/4 тестов прошли успешно
⚠️  Есть проблемы, требующие внимания.
```

## Типичные проблемы

### Сервер недоступен
```
❌ Ошибка: Failed to connect to ws://127.0.0.1:8000/lsp/python: WebSocket connection to ws://127.0.0.1:8000/lsp/python failed
```

**Решение:** Убедитесь что LSP сервер запущен на указанном адресе.

### Таймаут подключения
```
❌ Ошибка: WebSocket connection timeout after 10000ms
```

**Решение:**
- Проверьте доступность сервера
- Увеличьте таймаут в опциях транспорта

### Ошибка инициализации
```
❌ Ошибка: Сервер не вернул capabilities
```

**Решение:** Проверьте совместимость LSP сервера и корректность initialize запроса.

## Отладка

Для детальной отладки включите логирование:

```typescript
import { setLogLevel } from './utils/logger';
setLogLevel('DEBUG'); // или 'TRACE' для максимальной детализации
```

Уровни логирования:
- `TRACE` - максимальная детализация
- `DEBUG` - отладочная информация
- `INFO` - информационные сообщения (по умолчанию)
- `WARN` - предупреждения
- `ERROR` - только ошибки
- `SILENT` - без логов

## Создание собственных тестов

Пример простого теста:

```typescript
import { WebSocketTransport } from '../transports/WebSocketTransport';
import * as LSP from 'vscode-languageserver-protocol';

async function myTest() {
    const transport = new WebSocketTransport('ws://127.0.0.1:8000/lsp/python');

    try {
        await transport.connect();
        const connection = transport.connection;

        // Ваш тест здесь
        const result = await connection.sendRequest(
            LSP.InitializeRequest.type,
            { processId: null, rootUri: 'file:///test', capabilities: {} }
        );

        console.log('Тест прошел:', !!result.capabilities);

    } finally {
        transport.close();
    }
}
```

## Continuous Integration

Для CI/CD рекомендуется использовать быстрый тест:

```bash
npm run test:quick
```

Он выполняется быстрее и покрывает основную функциональность.
