# Добавленные возможности отмены операций

## Обзор изменений

В библиотеку `codemirror-languageserver` добавлена полная поддержка отмены операций, включающая:

1. **Стандартный механизм LSP** - использование `$/cancelRequest` для отмены запросов на сервере
2. **Браузерный API AbortSignal** - интеграция с современным стандартом отмены операций
3. **Автоматическое управление** - система автоматически отслеживает и отменяет запросы
4. **Утилиты для разработчиков** - набор вспомогательных функций для работы с отменой

## Ключевые компоненты

### RequestCancellation класс

- Управляет жизненным циклом запросов
- Автоматически отправляет `$/cancelRequest` уведомления
- Поддерживает таймауты и множественные AbortSignal

### Обновленный LanguageServerClient

- Все методы поддерживают AbortSignal
- Интегрированная система отслеживания запросов
- Автоматическая очистка ресурсов

### Утилиты отмены (src/utils/abort.ts)

- `createAbortControllerWithTimeout()` - контроллер с автоотменой
- `combineAbortSignals()` - объединение нескольких сигналов
- `withAbortSignal()` - добавление отмены к Promise
- `createAbortablePromise()` - создание отменяемых операций

### Обновленные провайдеры

- **HoverProvider** - поддержка отмены hover запросов
- **CompletionProvider** - отмена автодополнения
- **DiagnosticsProvider** - остается без изменений (push-based)

## API изменения

### Новые опции конфигурации

````typescript
interface LanguageServerOptions {
    abortSignal?: AbortSignal;           // Сигнал для всей сессии (автоматически включает отмену)
    connectionTimeout?: number;          // Таймаут подключения WebSocket
}

// Таймауты теперь управляются через AbortSignal
const controller = createAbortControllerWithTimeout(10000); // 10 секунд
const result = await client.textDocumentHover(params, controller.signal);
```</edits>

<old_text>
**Client Methods:**
- `textDocumentHover(params, abortSignal?)` - Hover information with cancellation
- `textDocumentCompletion(params, abortSignal?)` - Code completion with cancellation
- `sendRequest(method, params, abortSignal?)` - Generic request with cancellation
- `cancelRequest(requestId, reason?)` - Cancel specific request
- `getPendingRequests()` - Get active requests map

### Расширенные методы клиента
```typescript
// Все основные методы теперь принимают AbortSignal
textDocumentHover(params, abortSignal?)
textDocumentCompletion(params, abortSignal?)
sendRequest(method, params, timeout?, abortSignal?)

// Новые методы управления
cancelRequest(requestId, reason?)
getPendingRequests()
````

### Новые утилиты экспорта

```typescript
export {
    RequestCancellation,
    createAbortControllerWithTimeout,
    combineAbortSignals,
    isAborted,
    throwIfAborted,
    createAbortablePromise,
    withAbortSignal,
    delay,
    ErrorCodes,
};
```

## Совместимость

- **Обратная совместимость**: Все существующие API остаются без изменений
- **Умная отмена**: Клиентские Promise'ы всегда отменяются при AbortSignal, `$/cancelRequest` отправляется только если сервер поддерживает отмену
- **Graceful degradation**: При отсутствии поддержки сервером `$/cancelRequest` клиентская отмена все равно работает
- **Гибкие таймауты**: Каждая операция может иметь свой таймаут через AbortSignal
- **TypeScript**: Полная поддержка типов для всех новых возможностей</edits>

<old_text>

## Производительность

- Минимальные накладные расходы при отключенной отмене
- Эффективная очистка ресурсов при отмене операций
- Автоматическое управление таймаутами предотвращает утечки памяти

## Примеры использования

### Базовая отмена

```javascript
const controller = new AbortController();
const result = await client.textDocumentHover(params, controller.signal);
controller.abort(); // Отменить запрос
```

### Отмена с таймаутом

```javascript
// Создание controller с автоотменой через 5 секунд
const controller = createAbortControllerWithTimeout(5000);
const completion = await client.textDocumentCompletion(
    params,
    controller.signal,
);

// Разные таймауты для разных операций
const hoverController = createAbortControllerWithTimeout(3000); // Hover быстрый
const completionController = createAbortControllerWithTimeout(15000); // Completion медленнее
```

### Сессионная отмена

```javascript
// Сессия с общим таймаутом 60 секунд
const sessionController = createAbortControllerWithTimeout(60000);
const lspExtension = await languageServer({
    // ... другие опции
    abortSignal: sessionController.signal, // Автоматически включает поддержку отмены
});

// Или отмена только при закрытии страницы
const manualSessionController = new AbortController();
window.addEventListener('beforeunload', () => {
    manualSessionController.abort();
});
```

## Файлы изменений

### Новые файлы

- `src/client/RequestCancellation.ts` - Система управления отменой
- `src/utils/abort.ts` - Утилиты для работы с AbortSignal
- `examples/cancellation-example.js` - Демонстрация возможностей
- `docs/cancellation.md` - Подробная документация

### Модифицированные файлы

- `src/client/LanguageServerClient.ts` - Добавлена поддержка отмены
- `src/plugin/LanguageServerPlugin.ts` - Интеграция с системой отмены
- `src/features/hover.ts` - Отмена hover запросов
- `src/features/completion.ts` - Отмена автодополнения
- `src/plugin/factory.ts` - Поддержка AbortSignal в factory функциях
- `src/types/lsp.ts` - Новые типы для отмены
- `src/types/transport.ts` - Расширенные типы транспорта
- `src/utils/index.ts` - Экспорт новых утилит
- `src/index.ts` - Обновленный главный экспорт
- `README.md` - Документация по использованию

## Тестирование

Для тестирования функциональности отмены используйте:

1. Пример в `examples/cancellation-example.js`
2. Инструменты разработчика для мониторинга WebSocket трафика
3. Консольные методы для проверки активных запросов

## Производительность

- Минимальные накладные расходы при отключенной отмене
- Эффективная очистка ресурсов при отмене операций
- Автоматическое управление таймаутами предотвращает утечки памяти
