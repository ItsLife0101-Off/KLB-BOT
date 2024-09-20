import { Telegraf, Markup } from 'telegraf';
import { MongoClient } from 'mongodb';

const bot = new Telegraf('7155688956:AAE2aIAK5HWZBU4ibCj5ZXGv7VPldSnnhzw');
const adminId = 6375865271;

let collection;
let logChannelId = null; // Для хранения ID канала с логами

const url = "mongodb+srv://KLB2:IyRYJ4itur10@klb.wqnns.mongodb.net/";
const mongoClient = new MongoClient(url);

// Подключение к MongoDB
(async () => {
  try {
    await mongoClient.connect();
    const usersdb = mongoClient.db('KLB'); 
    collection = usersdb.collection('Users'); 
    console.log('\x1b[32m%s\x1b[0m', '[СИСТЕМА - УСПЕХ] MongoDB была подключена успешно!');

    // Проверка, существует ли админ
    const adminExists = await collection.findOne({ user_id: adminId });
    if (!adminExists) {
      await collection.insertOne({
        user_id: adminId,
        username: 'ItsLife', // Можно заменить на твой ник
        role: 'Creator', // Присваиваем роль администратора
        registration_date: new Date(),
      });
      console.log('[СИСТЕМА - УСПЕХ] Изначальный администратор добавлен в базу данных.');
    } else if (adminExists.role !== 'Creator') {
      // Обновляем роль администратора, если она установлена неправильно
      await collection.updateOne(
        { user_id: adminId },
        { $set: { role: 'Creator' } }
      );
      console.log('[СИСТЕМА - УСПЕХ] Роль администратора обновлена.');
    }
  } catch (e) {
    console.error('\x1b[31m%s\x1b[0m', `[СИСТЕМА - ОШИБКА] Не удалось подключиться к MongoDB: ${e.message}\n${e.stack}`, e);
  }
})();

// Логирование команд
function logAction(ctx, command) {
  if (logChannelId) {
    const message = `[ЛОГИ] Пользователь: ${ctx.from.username} (${ctx.from.id}) использовал команду: ${command} в ${new Date().toLocaleString()}`;
    bot.telegram.sendMessage(logChannelId, message);
  }
}

// Привязка канала логов (только для Creator, Code и Admin)
bot.command('connectchanel', async (ctx) => {
  const member = await bot.telegram.getChatMember(ctx.chat.id, ctx.from.id);

  // Проверяем роль пользователя в базе данных
  const user = await collection.findOne({ user_id: ctx.from.id });

  if (!user) {
    return ctx.reply('Вы не зарегистрированы в системе.');
  }

  if (!['Creator', 'Code', 'Admin'].includes(user.role)) {
    return ctx.reply('У вас недостаточно прав для использования этой команды.');
  }

  // Если пользователь имеет соответствующую роль, то привязываем канал для логов
  logChannelId = ctx.chat.id;
  ctx.reply('Этот канал теперь используется для логов.');
});

// Логирование всех команд
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text) {
    logAction(ctx, ctx.message.text);
  }
  return next();
});

// Команда для регистрации пользователей
bot.command('start', async (ctx) => {
  if (!collection) return ctx.reply('База данных не подключена.');
  
  const userId = ctx.from.id;
  const userExists = await collection.findOne({ user_id: userId });

  if (!userExists) {
    await collection.insertOne({
      user_id: userId,
      username: ctx.from.username,
      role: 'Игрок',
      registration_date: new Date(),
    });
    ctx.reply(`Привет, ${ctx.from.username}!`);
  } else {
    ctx.reply('Вы уже зарегистрированы.');
  }    
});

// Команда /setrole с использованием Custom Title
bot.command('setrole', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('Использование: /setrole [@пользователь] [роль], использовать без []');
  }

  const username = args[1].replace('@', ''); // Извлекаем имя пользователя без "@"
  const role = args[2];

  const roles = {
    'Creator': 'Создатель',
    'Code': 'Кодер',
    'Curator': 'Куратор',
    'Admin': 'Администратор',
    'Eventer': 'Конкурсовод',
  };

  if (!roles[role]) {
    return ctx.reply('Недопустимая роль. Возможные роли: Creator (Создатель), Code (Кодер), Curator (Куратор), Admin (Администратор), Eventer (Конкурсовод)');
  }

  try {
    // Проверяем роль того, кто вызывает команду
    const caller = await collection.findOne({ user_id: ctx.from.id });

    if (caller.role !== 'Admin' && caller.role !== 'Creator' && caller.role !== 'Code') {
      return ctx.reply('У вас недостаточно прав для использования этой команды.');
    }

    // Ищем пользователя по username
    const user = await collection.findOne({ username: username });
    if (!user) {
      return ctx.reply('Пользователь не найден в базе данных.');
    }

    // Присваиваем роль и выдаем права администратора
    await collection.updateOne(
      { username: username },
      { $set: { role: role } }
    );

    // Выдаем права администратора и устанавливаем Custom Title
    await bot.telegram.promoteChatMember(ctx.chat.id, user.user_id, {
      can_manage_chat: true,
      can_post_messages: true,
      can_edit_messages: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_promote_members: true
    });

    // Устанавливаем Custom Title
    await bot.telegram.setChatAdministratorCustomTitle(ctx.chat.id, user.user_id, roles[role]);

    ctx.reply(`Роль "${role}" и Префикс "${roles[role]}" выданы пользователю @${username}`);
  } catch (error) {
    console.error(error);
    ctx.reply('Произошла ошибка при выдаче роли и префикса.');
  }
});

// Команда для отправки поста
bot.hears('/post', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply('Команды можно использовать только в личных сообщениях.');
    return;
  }

  const userRole = await collection.findOne({ user_id: ctx.from.id }, { projection: { role: 1 } });

  if (!['Eventer', 'Admin', 'Curator'].includes(userRole.role)) {
    ctx.reply('У вас недостаточно прав для использования этой команды.');
    return;
  }

  ctx.telegram.sendMessage('-1002151634059',
    'ВНИМАНИЕ❗КОНКУРС \n\n💸 Фонд 》》》1.500.000.000.000.000+9 промокодов💸 \n\n✨Количество мест: 3✨\n\n500.000.000.000.000+промо на выбор (3шт)\n500.000.000.000.000+промо на выбор (3шт)\n500.000.000.000.000+промо на выбор (3шт)\n\n❗Условия конкурса: \n\n🖤Нажать на кнопку "участвовать". \n🤍Подписаться на данную группу\n💛Иметь не скрытый юзер нейм \n\n⏳Итоги через 24 часа', {
    reply_markup: { inline_keyboard: [[{ text: `Участвовать`, callback_data: `participate` }]] }
  }).catch((error) => {
    console.error('Ошибка отправки сообщения:', error);
    ctx.reply('Произошла ошибка при отправке сообщения. Пожалуйста, проверьте правильность ID группы и токена бота.');
  });

  ctx.reply('Пост выложен в "https://t.me/hfvuv678"', {
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback('Участвовать', 'participate')
    ])
  });
});

// Обработка участия в конкурсе
bot.action('participate', (ctx) => {
  return ctx.answerCbQuery(`Спасибо за участие!`);
});

// Старт бота
const startBot = async () => {
  try {
    await bot.launch();
    console.log('Бот запущен');
  } catch (error) {
    console.error('Ошибка запуска бота:', error);
    setTimeout(startBot, 1000);
  }
};

startBot();
