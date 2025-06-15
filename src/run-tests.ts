/**
 * Простой runner для базовых тестов LSP транспорта
 */

import BasicTester, { quickTest } from './tests/basic.test.js';
import { setLogLevel } from './utils/logger.js';

async function main() {
    console.log('🔧 CodeMirror Language Server - Тестирование транспорта\n');

    // Устанавливаем уровень логирования для отладки
    setLogLevel('INFO');

    const args = process.argv.slice(2);
    const isQuick = args.includes('--quick') || args.includes('-q');

    if (isQuick) {
        console.log('⚡ Режим быстрого тестирования\n');

        const success = await quickTest();

        if (success) {
            console.log('\n🎉 Быстрый тест пройден успешно!');
            process.exit(0);
        } else {
            console.log('\n💥 Быстрый тест провален!');
            process.exit(1);
        }
    } else {
        console.log('🧪 Режим полного тестирования\n');

        const tester = new BasicTester();
        await tester.runAll();

        console.log('\n📝 Для быстрого теста используйте: npm run test:quick');
    }
}

// Обработка ошибок
process.on(
    'unhandledRejection',
    (reason: unknown, promise: Promise<unknown>) => {
        console.error('💥 Необработанная ошибка Promise:', reason);
        process.exit(1);
    },
);

process.on('uncaughtException', (error: Error) => {
    console.error('💥 Необработанное исключение:', error);
    process.exit(1);
});

// Запуск
main().catch((error) => {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
});
