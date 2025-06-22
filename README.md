# CodeMirror 6 Language Server Plugin

CodeMirror 6 extension для подключения к Language Server через WebSocket с поддержкой автодополнения, hover-подсказок и диагностики.

## Установка

```bash
npm install github:korbash/codemirror-languageserver#full-python
```

## Использование

```js
import { EditorState, EditorView } from '@codemirror/basic-setup';
import { languageServer, setLogLevel } from 'codemirror-languageserver';
import { python } from '@codemirror/lang-python';

setLogLevel('DEBUG');

async function createEditor() {
    const lspExtension = await languageServer({
        serverUri: 'ws://localhost:3000',
        rootUri: 'file:///',
        documentUri: 'file:///script.py',
        languageId: 'python',
    });

    return new EditorView({
        state: EditorState.create({
            extensions: [python(), ...lspExtension],
        }),
        parent: document.body,
    });
}

createEditor().catch(console.error);
```

## Обработка ошибок

```js
try {
    const lspExtension = await languageServer({
        serverUri: 'ws://localhost:3000',
        rootUri: 'file:///',
        documentUri: 'file:///script.py',
        languageId: 'python',
    });
    // Создание редактора с LSP
} catch (error) {
    console.error('LSP failed:', error);
    // Fallback без LSP
}
```

## API

### Основные функции

- `languageServer(options)` - создание LSP расширения
- `languageServerWithTransport(options)` - с кастомным транспортом
- `getLanguageServerClient(view)` - получение LSP клиента
- `setLogLevel(level)` - настройка логирования (`TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT`)

### Отмена запросов

```js
import {
    getLanguageServerClient,
    createAbortControllerWithTimeout,
} from 'codemirror-languageserver';

const client = getLanguageServerClient(view);

// С таймаутом
const controller = createAbortControllerWithTimeout(5000);
const result = await client.textDocumentHover(params, controller.signal);

// Отмена всей сессии
const sessionController = new AbortController();
const lspExtension = await languageServer({
    serverUri: 'ws://localhost:3000',
    rootUri: 'file:///',
    documentUri: 'file:///script.py',
    languageId: 'python',
    abortSignal: sessionController.signal,
});

// Управление активными запросами
const pendingRequests = client.getPendingRequests();
await client.cancelRequest('req_123', 'User cancelled');
```

### Методы клиента

- `textDocumentHover(params, abortSignal?)`
- `textDocumentCompletion(params, abortSignal?)`
- `sendRequest(method, params, abortSignal?)`
- `cancelRequest(requestId, reason?)`
- `getPendingRequests()`

## Архитектура

### Обновленная архитектура (v2.0)

**Ключевые изменения:**

- Интеграция управления WebSocket соединением прямо в `LanguageClient`
- Удален отдельный `ConnectionManager` для упрощения архитектуры
- Улучшенная обработка жизненного цикла соединения
- Автоматическое переподключение с правильной инициализацией
- Четкое управление состоянием: `close` → `open` → `initialize` → `running`

### Структура библиотеки

```
src/
├── core/                   # Основные компоненты
│   ├── LanguageClient.ts          # Главный LSP клиент с интеграцией WebSocket
│   ├── RequestManager.ts          # Управление запросами и отменой
│   └── SubscriptionManager.ts     # Управление подписками на события
├── transport/              # Транспортный слой
│   ├── WebSocketMessageReader.ts  # Чтение сообщений через WebSocket
│   └── WebSocketMessageWriter.ts  # Запись сообщений через WebSocket
├── types/                  # TypeScript типы и утилиты
│   ├── ErrorConverter.ts          # Конвертация и нормализация ошибок
│   ├── Subscription.ts            # RAII-управление подписками
│   └── index.ts                   # Экспорт всех типов
└── index.ts                # Главный экспорт модуля
```

### Основные компоненты

#### `LanguageClient`

Центральный компонент с интегрированным управлением WebSocket соединением:

- Управляет полным жизненным циклом LSP соединения
- Интегрированное управление WebSocket с автоматическим переподключением
- Правильная обработка событий: `close` → `open` → `initialize` → `running`
- Отправляет запросы и уведомления с поддержкой отмены
- Блокирует запросы при отсутствии соединения до реинициализации

#### `RequestManager`

Управление LSP запросами и их жизненным циклом:

- Поддержка отмены запросов по ID или групповой отмены
- Retry-логика с экспоненциальным backoff
- Статистика выполнения запросов
- Интеграция с системой отмены Microsoft LSP

#### `SubscriptionManager`

Управление подписками на LSP уведомления:

- RAII-стиль управления ресурсами
- Автоматическая очистка при закрытии соединения
- Мониторинг активных подписок
- Интеграция с Microsoft Connection API

#### WebSocket Message Layer

Транспортный слой для LSP сообщений:

- **WebSocketMessageReader** - чтение LSP сообщений из WebSocket
- **WebSocketMessageWriter** - запись LSP сообщений в WebSocket
- Совместимость с Microsoft vscode-languageserver-protocol
- Правильная обработка бинарных данных и кодировки

### Поток данных

```
CodeMirror Editor
       ↓
LanguageClient
  ├─ RequestManager
  ├─ SubscriptionManager
  └─ WebSocket (ReconnectingWebSocket)
       ↓
LSP Server
```

1. **Редактор** генерирует события (изменения текста, курсор)
2. **LanguageClient** получает запросы и проверяет состояние соединения
3. **RequestManager** управляет отправкой запросов с retry-логикой
4. **WebSocket** передает LSP сообщения с автоматическим переподключением
5. **Server** обрабатывает запросы и возвращает результаты
6. **SubscriptionManager** маршрутизирует уведомления к обработчикам
7. **LanguageClient** применяет результаты или уведомляет об ошибках

### Жизненный цикл соединения

```
Initial → Connecting → Initializing → Running
    ↑                     ↓
    ←─────── Error ←──────┘
    ↑                     ↓
    ←──── Stopped ←── Stopping
```

**Ключевые принципы:**

- При `close` событии: сброс состояния, отмена запросов, блокировка новых
- При `open` событии: реинициализация, если было активное соединение
- Запросы блокируются до завершения инициализации
- Автоматическое переподключение с правильной последовательностью событий

### Расширяемость

Новая архитектура обеспечивает простое расширение:

```js
// Кастомный обработчик событий соединения
class CustomLanguageClient extends LanguageClient {
    protected onWebSocketOpen() {
        super.onWebSocketOpen();
        console.log('Custom connection logic');
    }

    protected onWebSocketClose() {
        // Custom reconnection logic
        super.onWebSocketClose();
    }
}

// Кастомная обработка ошибок
const client = new LanguageClient(options);
client.onError((error) => {
    if (error.code === -32603) {
        // Custom error handling
        console.log('Server internal error, retrying...');
    }
});

// Мониторинг состояния
client.onStateChange((state) => {
    switch (state) {
        case ServerState.Connecting:
            showConnectingSpinner();
            break;
        case ServerState.Running:
            hideSpinner();
            break;
    }
});

// Использование с async/await
try {
    const client = await createAndInitializeLanguageClient(options);
    // Client ready to use
} catch (error) {
    // Handle initialization errors
}
```

## Производительность и Best Practices

### Оптимизация производительности

#### 1. Настройка timeouts

```js
// Разные timeouts для разных операций
const client = getLanguageServerClient(view);

// Быстрые операции - короткий timeout
const hoverResult = await client.textDocumentHover(
    params,
    createAbortControllerWithTimeout(2000).signal,
);

// Автодополнение - средний timeout
const completion = await client.textDocumentCompletion(
    params,
    createAbortControllerWithTimeout(5000).signal,
);

// Сложные операции - длинный timeout
const symbols = await client.sendRequest(
    'textDocument/documentSymbol',
    params,
    createAbortControllerWithTimeout(15000).signal,
);
```

#### 2. Debouncing изменений

```js
class OptimizedPlugin extends LanguageServerPlugin {
    constructor(view, options) {
        super(view, options);
        this.changeDebounceTimeout = null;
        this.changeDelay = 300; // 300ms debounce
    }

    update(update) {
        if (update.docChanged) {
            // Отменяем предыдущий timeout
            if (this.changeDebounceTimeout) {
                clearTimeout(this.changeDebounceTimeout);
            }

            // Устанавливаем новый timeout
            this.changeDebounceTimeout = setTimeout(() => {
                this.syncDocument(update);
            }, this.changeDelay);
        }
    }
}
```

## Тестирование

```bash
npm run sanity      # Быстрая проверка
npm test           # Все тесты
npm run test:watch # Режим наблюдения
```

### Изучение ответов сервера

Для визуального изучения ответов LSP сервера доступны специальные тесты:

```bash
npm run test:detailed  # Детальные ответы с полным JSON
npm run test:demo      # Демонстрационные тесты
npm run test:debug     # Отладочные тесты с подробным логированием
```

Эти тесты показывают:

- **Автодополнение**: полные структуры ответов с типами и документацией
- **Hover подсказки**: содержимое и диапазоны
- **Go to Definition**: точные позиции определений
- **Find References**: все ссылки на символы

Подробности в [TESTING.md](TESTING.md) и [docs/server-responses-guide.md](docs/server-responses-guide.md).

## Лицензия

BSD-3-Clause
