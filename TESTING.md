# Тестирование

Современная система тестирования на **Mocha** + **TypeScript ESM** по образцу Microsoft vscode-languageserver-node.

## Быстрый старт

```bash
npm run sanity    # Базовая проверка (рекомендуется)
npm test         # Все тесты
npm run test:watch # Режим наблюдения
```

**Примечание:** Предупреждения Node.js о `--experimental-loader` и `fs.Stats` - это нормально и не влияют на работу тестов.

## Команды

| Команда                   | Описание                                |
| ------------------------- | --------------------------------------- |
| `npm run sanity`          | Быстрая проверка работоспособности      |
| `npm test`                | Все тесты                               |
| `npm run test:connection` | Только WebSocket подключение            |
| `npm run test:lsp`        | Только LSP протокол                     |
| `npm run test:detailed`   | Детальные ответы сервера (для изучения) |
| `npm run test:demo`       | Демонстрационные тесты с отладкой       |
| `npm run test:debug`      | Отладочные тесты с полным логированием  |
| `npm run test:watch`      | Автоперезапуск при изменениях           |

## Структура

```
src/test/
├── sanity.test.ts              # Критические проверки
├── connection.test.ts          # WebSocket транспорт
├── lsp.test.ts                # LSP протокол
├── detailed-responses.test.ts  # Детальные ответы сервера (для изучения)
├── demo-responses.test.ts      # Демонстрационные тесты
└── debug-responses.test.ts     # Отладочные тесты с подробным логированием
```

## Настройка сервера

Тесты подключаются к Python LSP серверу на `ws://127.0.0.1:8000/lsp/python`.

**Важно:** Если сервер недоступен, тесты автоматически пропускаются с предупреждением.

## Интерпретация результатов

### ✅ Успех

```
  Sanity Check
    ✔ WebSocket transport can connect (50ms)
    ✔ WebSocket transport provides connection after connect
    ✔ WebSocket transport throws error when accessing connection before connect
    ✔ WebSocket transport can be closed safely

  23 passing (4s)
```

### ⚠️ Предупреждения

```
  LSP Protocol
    ⚠️  LSP server not available at ws://127.0.0.1:8000/lsp/python
    ✔ Initialize LSP server
  1 passing (45ms)
```

### ❌ Ошибки

```
  WebSocket Connection
    ✗ Connect timeout (timeout exceeded)
      Error: Test exceeded timeout 10000ms
  1 failing
```

## Добавление тестов

### Новый файл

```typescript
// src/test/my-feature.test.ts
import assert from 'assert';
import { WebSocketTransport } from '../transports/WebSocketTransport.js';

const TEST_SERVER_URL = 'ws://127.0.0.1:8000/lsp/python';

describe('My Feature', () => {
    it('should work correctly', async () => {
        const transport = new WebSocketTransport(TEST_SERVER_URL);

        try {
            await transport.connect();
            assert.ok(transport.isConnected);
        } finally {
            transport.close(); // Обязательная очистка
        }
    });
});
```

### Специальные тесты для изучения ответов сервера

#### Детальные тесты (`detailed-responses.test.ts`)

Комплексные тесты для изучения полных ответов LSP сервера:

```bash
npm run test:detailed  # Запуск детальных тестов
```

Функции:

- **Полные JSON ответы** сервера в читаемом формате
- **Автодополнение**: все варианты с типами, документацией и деталями
- **Hover информацию**: полное содержимое подсказок с диапазонами
- **Go to Definition**: точные позиции определений
- **Find References**: все ссылки на символы с контекстом

#### Демонстрационные тесты (`demo-responses.test.ts`)

Простые тесты для быстрой проверки ответов сервера:

```bash
npm run test:demo      # Запуск демо-тестов
```

Особенности:

- **Простой код**: базовые Python конструкции
- **Пошаговое логирование**: четкие этапы выполнения
- **Понятный вывод**: информативные сообщения о результатах

#### Отладочные тесты (`debug-responses.test.ts`)

Максимально подробные тесты для глубокой отладки:

```bash
npm run test:debug     # Запуск отладочных тестов
```

Возможности:

- **Полное логирование**: каждый шаг выполнения
- **Анализ типов**: детальная информация о типах ответов
- **Обработка ошибок**: подробные сообщения об ошибках
- **Диагностика соединения**: состояние подключения к серверу

**Примечание**: Все специальные тесты предназначены для разработки и изучения LSP протокола. Они выводят много информации в консоль для визуального анализа ответов сервера.

#### Выбор подходящего теста

- **`test:detailed`** - для комплексного изучения всех типов ответов
- **`test:demo`** - для быстрой проверки базовой функциональности
- **`test:debug`** - для глубокой отладки проблем с сервером

### Запуск отдельного теста

```bash
NODE_OPTIONS="--loader ts-node/esm" npx mocha src/test/my-feature.test.ts
```

## Принципы

- **Независимость**: каждый тест самодостаточен
- **Graceful degradation**: корректная обработка недоступного сервера
- **Очистка ресурсов**: обязательный `finally` блок
- **Четкие сообщения**: информативные assert сообщения
- **ESM совместимость**: использует современные ES модули с TypeScript

## Отладка

### VS Code

Создайте `.vscode/launch.json`:

```json
{
    "type": "node",
    "request": "launch",
    "name": "Debug Tests",
    "program": "${workspaceFolder}/node_modules/mocha/bin/_mocha",
    "args": ["--loader", "ts-node/esm", "src/test/**/*.test.ts"],
    "env": { "NODE_OPTIONS": "--loader ts-node/esm" }
}
```

### Детальный вывод

```bash
npx mocha --reporter spec
```
