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

### Структура библиотеки

```
src/
├── client/                 # LSP клиент
│   ├── LanguageServerClient.ts    # Основной LSP клиент
│   └── RequestCancellation.ts     # Система отмены запросов
├── features/               # Провайдеры функций
│   ├── completion.ts              # Автодополнение
│   ├── hover.ts                   # Hover подсказки
│   └── diagnostics.ts             # Диагностика и линтинг
├── plugin/                 # CodeMirror интеграция
│   ├── LanguageServerPlugin.ts    # Основной плагин
│   ├── factory.ts                 # Фабричные функции
│   └── facets.ts                  # CodeMirror facets
├── transports/             # Транспортные слои
│   ├── WebSocketTransport.ts      # WebSocket транспорт
│   └── WebSocketMessage.ts        # WebSocket сообщения
├── types/                  # TypeScript типы
└── utils/                  # Утилиты (логгер, abort signals)
```

### Основные компоненты

#### `LanguageServerClient`

Центральный компонент для взаимодействия с LSP сервером:

- Управляет жизненным циклом подключения
- Отправляет запросы и уведомления
- Обрабатывает отмену запросов
- Поддерживает различные типы серверов (Python, TypeScript, etc.)

#### `WebSocketTransport`

Надежный транспорт для WebSocket соединений:

- Использует Microsoft's vscode-languageserver подход
- Автоматическое переподключение
- Graceful обработка ошибок
- Поддержка timeout'ов

#### `LanguageServerPlugin`

CodeMirror плагин, связывающий редактор с LSP:

- Отслеживает изменения документа
- Синхронизирует состояние с сервером
- Управляет провайдерами функций
- Обрабатывает события редактора

#### Feature Providers

Модульные провайдеры LSP функций:

- **CompletionProvider** - автодополнение кода
- **HoverProvider** - контекстные подсказки
- **DiagnosticsProvider** - ошибки и предупреждения

### Поток данных

```
CodeMirror Editor
       ↓
LanguageServerPlugin
       ↓
LanguageServerClient
       ↓
WebSocketTransport
       ↓
LSP Server
```

1. **Редактор** генерирует события (изменения текста, курсор)
2. **Plugin** обрабатывает события и преобразует в LSP запросы
3. **Client** отправляет запросы через транспорт
4. **Transport** управляет WebSocket соединением
5. **Server** обрабатывает запросы и возвращает результаты
6. **Plugin** применяет результаты к редактору

### Расширяемость

Библиотека спроектирована для легкого расширения:

```js
// Кастомный провайдер автодополнения
class MyCompletionProvider {
    async provideCompletionItems(params, client) {
        // Ваша логика
        return completions;
    }
}

// Кастомный транспорт
class MyTransport {
    async connect() {
        /* ... */
    }
    get connection() {
        /* ... */
    }
}

// Использование
const lspExtension = await languageServerWithTransport({
    transport: new MyTransport(),
    completionProvider: new MyCompletionProvider(),
});
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
