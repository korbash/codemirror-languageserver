# Отмена операций в CodeMirror Language Server

Простое руководство по отмене LSP операций с помощью `AbortSignal`.

## Основное использование

```javascript
import {
    languageServer,
    createAbortControllerWithTimeout,
} from 'codemirror-languageserver';

// Создание LSP расширения с отменой через 5 минут
const sessionController = createAbortControllerWithTimeout(300000);
const lspExtension = await languageServer({
    serverUri: 'ws://localhost:3000',
    rootUri: 'file:///',
    documentUri: 'file:///example.py',
    languageId: 'python',
    abortSignal: sessionController.signal,
});
```

### Отмена с таймаутом

```javascript
import { createAbortControllerWithTimeout } from 'codemirror-languageserver';

// Создание controller с автоотменой через 5 секунд
const controller = createAbortControllerWithTimeout(5000);

const completion = await client.textDocumentCompletion(
    {
        textDocument: { uri: 'file:///example.py' },
        position: { line: 10, character: 0 },
    },
    controller.signal,
);
```

## Отмена операций

```javascript
const client = getLanguageServerClient(view);

// Разные таймауты для разных операций
const hoverResult = await client.textDocumentHover(
    params,
    createAbortControllerWithTimeout(3000).signal,
);

const completionResult = await client.textDocumentCompletion(
    params,
    createAbortControllerWithTimeout(10000).signal,
);

// Ручная отмена
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const result = await client.sendRequest(
    'custom/method',
    params,
    controller.signal,
);
```

## Обработка ошибок

```javascript
import { RequestCancellation } from 'codemirror-languageserver';

try {
    const result = await client.textDocumentCompletion(params, abortSignal);
} catch (error) {
    if (RequestCancellation.isCancellationError(error)) {
        return null; // Тихо игнорируем отмену
    }
    throw error; // Только реальные ошибки
}
```

## Комбинирование сигналов

```javascript
import { combineAbortSignals } from 'codemirror-languageserver';

const userController = new AbortController();
const timeoutController = createAbortControllerWithTimeout(30000);

const combined = combineAbortSignals(
    userController.signal,
    timeoutController.signal,
);
const result = await client.textDocumentHover(params, combined);
```

## Умная отмена устаревших запросов

```javascript
class HoverProvider {
    constructor() {
        this.currentController = null;
    }

    async provideHover(params) {
        // Отменяем предыдущий запрос
        this.currentController?.abort();

        // Создаем новый с таймаутом
        this.currentController = createAbortControllerWithTimeout(3000);

        try {
            const result = await client.textDocumentHover(
                params,
                this.currentController.signal,
            );
            return result;
        } finally {
            this.currentController = null;
        }
    }
}
```

## API

### Методы клиента

- `textDocumentHover(params, abortSignal?)`
- `textDocumentCompletion(params, abortSignal?)`
- `sendRequest(method, params, abortSignal?)`

### Утилиты

- `createAbortControllerWithTimeout(ms)` - автоотмена через таймаут
- `combineAbortSignals(...signals)` - объединение сигналов
- `RequestCancellation.isCancellationError(error)` - проверка отмены
  </edits>
