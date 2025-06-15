/**
 * Самый простой тест - только проверка подключения
 * Минимальная проверка адекватности кода
 */

import { WebSocketTransport } from './transports/WebSocketTransport.js';

async function sanityCheck() {
    console.log('🔍 Проверка работоспособности...');

    const transport = new WebSocketTransport('ws://127.0.0.1:8000/lsp/python');

    try {
        console.log('⏳ Подключение...');
        await transport.connect();

        if (transport.isConnected) {
            console.log('✅ РАБОТАЕТ! WebSocket подключение успешно');
            return true;
        } else {
            console.log('❌ НЕ РАБОТАЕТ! Подключение неуспешно');
            return false;
        }
    } catch (error) {
        console.log(
            '❌ ОШИБКА:',
            error instanceof Error ? error.message : error,
        );
        return false;
    } finally {
        transport.close();
        console.log('🔚 Подключение закрыто');
    }
}

// Запуск
sanityCheck()
    .then((success) => {
        if (success) {
            console.log('🎉 КОД АДЕКВАТЕН');
            process.exit(0);
        } else {
            console.log('💥 КОД НЕ РАБОТАЕТ');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.log(
            '💥 КРИТИЧЕСКАЯ ОШИБКА:',
            error instanceof Error ? error.message : error,
        );
        process.exit(1);
    });
