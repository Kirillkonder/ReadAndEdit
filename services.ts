// services.ts - Сервисы (Admin, Subscription, MarketAPI и утилиты)
import { Context } from "grammy";
import dedent from "dedent";
import { UserRepository, IUserRepository, MAIN_ADMIN_ID } from "./database";

// Utility functions
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.toLocaleString("default", { year: "numeric" });
  const month = date.toLocaleString("default", { month: "2-digit" });
  const day = date.toLocaleString("default", { day: "2-digit" });
  const hour = date.toLocaleString("default", { hour: "2-digit" });
  const minutes = date.toLocaleString("default", { minute: "2-digit" });
  const seconds = date.toLocaleString("default", { second: "2-digit" });

  return `${day}.${month}.${year} ${hour}:${minutes}:${seconds}`;
}

// Market API Client
export class MarketApiClient {
  private apiBaseUrl: string = "https://gifts2.tonnel.network/api";

  public async getUserListedGifts(userId: number): Promise<any> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/pageGifts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            "page": 1,
            "limit": 30,
            "sort": "{\"message_post_time\":-1,\"gift_id\":-1}",
            "filter": `{\"seller\":${userId}}`,
          }),
        }
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching user listed gifts:", error);
      return [];
    }
  }
}

// Admin Service
export class AdminService {
  private usersCollection = new UserRepository();

  async isAdmin(userId: number): Promise<boolean> {
    return await this.usersCollection.isAdmin(userId);
  }

  async isMainAdmin(userId: number): Promise<boolean> {
    return userId === MAIN_ADMIN_ID;
  }

  async showAdminPanel(ctx: Context): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) {
    await ctx.reply("❌ У вас нет доступа к админ-панели.");
    return;
  }

  const totalUsers = await this.usersCollection.getAllUsers();
  
  // ИСПРАВЛЕНИЕ: правильный подсчет активных подписок
  let activeSubscriptions = 0;
  
  for (const user of totalUsers) {
    // ДЕБАГ: логируем статус каждого пользователя
    const actualStatus = await this.usersCollection.getSubscriptionStatus(user.userId);
    const dbStatus = user.subscriptionActive;
    
    console.log(`DEBUG: User ${user.userId} - DB: ${dbStatus}, Actual: ${actualStatus}, Expires: ${user.subscriptionExpires ? new Date(user.subscriptionExpires).toLocaleString() : 'null'}`);
    
    if (actualStatus) {
      activeSubscriptions++;
    }
  }

  const admins = await this.usersCollection.getAllAdmins();

  await ctx.reply(
    dedent`
      👑 <b>Админ-панель</b>
      
      📊 <b>Статистика:</b>
      • Всего пользователей: ${totalUsers.length}
      • Активных подписок: ${activeSubscriptions}
      • Администраторов: ${admins.length}
      
      🛠️ <b>Доступные действия:</b>
    `,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Список пользователей", callback_data: "admin_users" }],
          [{ text: "👑 Список администраторов", callback_data: "admin_admins" }],
          [{ text: "💎 Выдать подписку", callback_data: "admin_give_sub_menu" }],
          [{ text: "❌ Удалить подписку", callback_data: "admin_remove_sub_menu" }],
          [{ text: "👤 Инфо о пользователе", callback_data: "admin_user_info_menu" }],
          [{ text: "⚡ Управление админами", callback_data: "admin_manage_admins" }],
          [{ text: "📢 Рассылка сообщений", callback_data: "admin_broadcast_menu" }],
          [{ text: "💰 Заявки на вывод", callback_data: "admin_withdrawals" }],
          [{ text: "🔄 Обновить статистику", callback_data: "admin_stats" }],
          [{ text: "🔄 Исправить статусы подписок", callback_data: "admin_fix_subscriptions" }], // НОВАЯ КНОПКА
          [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
        ]
      }
    }
  );
}

async fixSubscriptionStatuses(ctx: Context): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  try {
    const result = await this.usersCollection.fixExpiredSubscriptions();
    
    await ctx.reply(
      `🔧 <b>Статусы подписок исправлены</b>\n\nИсправлено: ${result.fixed} пользователей\nВсего: ${result.total} пользователей\n\nТеперь статистика должна отображаться корректно.`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Обновить статистику", callback_data: "admin_stats" }],
            [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  } catch (error) {
    await ctx.reply("❌ Ошибка при исправлении статусов подписок");
  }
}

  async showUsersList(ctx: Context): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  const users = await this.usersCollection.getAllUsers();
  
  let message = `👥 <b>Список пользователей</b> (всего: ${users.length})\n\n`;
  
  // ДЕБАГ: проверим что возвращает getAllUsers()
  console.log(`DEBUG: Total users from DB: ${users.length}`);
  console.log(`DEBUG: First user:`, users[0]);
  
  // Если пользователей нет
  if (users.length === 0) {
    message += "❌ Пользователей не найдено";
    await ctx.reply(message, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
        ]
      }
    });
    return;
  }

  // УБИРАЕМ ОГРАНИЧЕНИЕ И ПОКАЗЫВАЕМ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
  const displayedUsers = users;
  
  console.log(`DEBUG: Displaying ${displayedUsers.length} users`);
  
  // Формируем список пользователей
  for (let i = 0; i < displayedUsers.length; i++) {
    const user = displayedUsers[i];
    
    // ДЕБАГ: информация о каждом пользователе
    console.log(`DEBUG: User ${i}:`, {
      id: user.userId,
      firstName: user.firstName,
      subscriptionActive: user.subscriptionActive
    });
    
    const status = user.subscriptionActive ? "✅" : "❌";
    const adminStatus = user.isAdmin ? "👑" : "";
    
    // Экранируем специальные HTML символы в именах пользователей
    const safeFirstName = user.firstName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    const safeLastName = user.lastName 
      ? user.lastName
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      : '';
    
    const username = user.username ? `@${user.username}` : "нет username";
    
    const fullName = safeLastName 
      ? `${safeFirstName} ${safeLastName}` 
      : safeFirstName;
    
    message += `${i + 1}. ${status} ${adminStatus} ${fullName} (ID: ${user.userId}) - ${username}\n`;
  }

  // УБИРАЕМ СООБЩЕНИЕ О СКРЫТЫХ ПОЛЬЗОВАТЕЛЯХ, ТАК КАК ПОКАЗЫВАЕМ ВСЕХ
  // ВМЕСТО ЭТОГО ДОБАВЛЯЕМ ИТОГОВУЮ СТАТИСТИКУ
  message += `\n📊 <b>Итого:</b> ${users.length} пользователей`;

  // ДЕБАГ: посмотрим на финальное сообщение
  console.log(`DEBUG: Final message length: ${message.length}`);
  console.log(`DEBUG: Message preview:`, message.substring(0, 200));
  
  await ctx.reply(message, { 
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
      ]
    }
  });
}


async updateAllSubscriptionStatuses(ctx: Context): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  try {
    const result = await this.usersCollection.updateAllSubscriptionStatuses();
    
    await ctx.reply(
      `✅ <b>Статусы подписок обновлены</b>\n\nОбновлено: ${result.updated} пользователей\nВсего: ${result.total} пользователей`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  } catch (error) {
    await ctx.reply("❌ Ошибка при обновлении статусов подписок");
  }
}

  async showAdminsList(ctx: Context): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  const admins = await this.usersCollection.getAllAdmins();
  
  let message = `👑 <b>Список администраторов</b> (всего: ${admins.length})\n\n`;
  
  admins.forEach((admin, index) => {
    const mainAdmin = admin.userId === MAIN_ADMIN_ID ? " [ГЛАВНЫЙ]" : "";
    
    // Экранируем специальные HTML символы
    const safeFirstName = admin.firstName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    const safeLastName = admin.lastName 
      ? admin.lastName
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      : '';
    
    const username = admin.username ? `@${admin.username}` : "нет username";
    
    const fullName = safeLastName 
      ? `${safeFirstName} ${safeLastName}` 
      : safeFirstName;
    
    message += `${index + 1}. ${fullName} (ID: ${admin.userId}) - ${username}${mainAdmin}\n`;
  });

  await ctx.reply(message, { 
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
      ]
    }}
  );
}


  async showGiveSubscriptionMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "💎 <b>Выдать подписку</b>\n\nВведите ID пользователя и количество дней через пробел:\n\nПример:\n<code>123456789 30</code> - выдать на 30 дней\n<code>123456789 -1</code> - вечная подписка",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  }

  async showRemoveSubscriptionMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "❌ <b>Удалить подписку</b>\n\nВведите ID пользователя:\n\nПример:\n<code>123456789</code>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  }

  async showUserInfoMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "👤 <b>Информация о пользователе</b>\n\nВведите ID пользователя:\n\nПример:\n<code>123456789</code>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  }

  async showManageAdminsMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "⚡ <b>Управление администраторами</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "👑 Назначить админа", callback_data: "admin_make_admin_menu" }],
            [{ text: "❌ Снять админа", callback_data: "admin_remove_admin_menu" }],
            [{ text: "⬅️ Назад", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  }

  async showMakeAdminMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "👑 <b>Назначить администратора</b>\n\nВведите ID пользователя:\n\nПример:\n<code>123456789</code>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад", callback_data: "admin_manage_admins" }]
          ]
        }
      }
    );
  }

  async showRemoveAdminMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    await ctx.reply(
      "❌ <b>Снять администратора</b>\n\nВведите ID пользователя:\n\nПример:\n<code>123456789</code>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад", callback_data: "admin_manage_admins" }]
          ]
        }
      }
    );
  }

  async showBroadcastMenu(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    // Устанавливаем флаг ожидания сообщения для рассылки
    const usersCollection = new UserRepository();
    await usersCollection.setAttribute(ctx.from!.id, 'awaitingBroadcastMessage', 1);

    await ctx.reply(
      "📢 <b>Рассылка сообщений</b>\n\nВведите сообщение, которое хотите отправить всем пользователям бота:",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Отмена", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  }

  async broadcastMessage(ctx: Context, messageText: string): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  try {
    // СБРАСЫВАЕМ ФЛАГ СРАЗУ, чтобы избежать повторной отправки
    const usersCollection = new UserRepository();
    await usersCollection.setAttribute(ctx.from!.id, 'awaitingBroadcastMessage', 0);
    
    const allUsers = await usersCollection.getAllUsers();
    
    let successCount = 0;
    let failCount = 0;
    
    // Отправляем сообщение о начале рассылки
    const statusMessage = await ctx.reply(`🔄 Начинаю рассылку сообщения для ${allUsers.length} пользователей...`);

    for (const user of allUsers) {
      try {
        await ctx.api.sendMessage(
          user.userId,
          `📢 <b>Важное сообщение от администрации:</b>\n\n${messageText}`,
          { parse_mode: "HTML" }
        );
        successCount++;
        
        // Небольшая задержка чтобы не превысить лимиты Telegram
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Не удалось отправить сообщение пользователю ${user.userId}:`, error);
        failCount++;
      }
    }

    // Обновляем статус рассылки
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      `✅ <b>Рассылка завершена!</b>\n\n📊 Результаты:\n• Успешно: ${successCount}\n• Не удалось: ${failCount}\n• Всего: ${allUsers.length}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
          ]
        }
      }
    );

  } catch (error) {
    console.error("Error in broadcastMessage:", error);
    await ctx.reply("❌ Произошла ошибка при рассылке сообщений.");
  }
}

  async giveSubscription(ctx: Context, userId: number, days: number): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  try {
    await this.usersCollection.activateSubscription(userId, days, "admin");
    
    const user = await this.usersCollection.getUserById(userId);
    const expiresDate = new Date(user.subscriptionExpires!);
    const totalDays = Math.ceil((user.subscriptionExpires! - Date.now()) / (1000 * 60 * 60 * 24));
    
    await ctx.reply(
      dedent`
        ✅ <b>Подписка выдана успешно!</b>
        
        👤 Пользователь: ${user.firstName} (ID: ${user.userId})
        📅 Добавлено дней: ${days}
        🗓️ Действует до: ${expiresDate.toLocaleDateString('ru-RU')}
        ⏳ Всего дней подписки: ${totalDays}
      `,
      { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
          ]
        }
      }
    );
  } catch (error) {
    await ctx.reply("❌ Ошибка при выдаче подписки. Пользователь не найден.");
  }
}

  async removeSubscription(ctx: Context, userId: number): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    try {
      await this.usersCollection.setAttribute(userId, 'subscriptionActive', 0);
      await this.usersCollection.setAttribute(userId, 'subscriptionTier', 'free');
      
      const user = await this.usersCollection.getUserById(userId);
      
      await ctx.reply(
        `✅ Подписка удалена у пользователя ${user.firstName} (ID: ${user.userId})`,
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
            ]
          }
        }
      );
    } catch (error) {
      await ctx.reply("❌ Ошибка при удалении подписки. Пользователь не найден.");
    }
  }

  async showUserInfo(ctx: Context, userId: number): Promise<void> {
  if (!await this.isAdmin(ctx.from!.id)) return;

  try {
    const user = await this.usersCollection.getUserById(userId);
    
    // ИСПРАВЛЕНИЕ: используем актуальный статус подписки
    const hasActiveSubscription = await this.usersCollection.getSubscriptionStatus(userId);
    
    let subscriptionInfo = "❌ Нет активной подписки";
    if (hasActiveSubscription && user.subscriptionExpires) {
      const expiresDate = new Date(user.subscriptionExpires);
      const daysLeft = Math.ceil((user.subscriptionExpires - Date.now()) / (1000 * 60 * 60 * 24));
      subscriptionInfo = `✅ Активна (осталось ${daysLeft} дней, до ${expiresDate.toLocaleDateString('ru-RU')})`;
    }

    const adminStatus = user.isAdmin ? "👑 Администратор" : "👤 Пользователь";
    const isMainAdmin = userId === MAIN_ADMIN_ID;

    // Экранируем специальные HTML символы
    const safeFirstName = user.firstName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    const safeLastName = user.lastName 
      ? user.lastName
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      : '';

    await ctx.reply(
      dedent`
        👤 <b>Информация о пользователе</b>
        
        🆔 ID: <code>${user.userId}</code>
        📛 Имя: ${safeFirstName} ${safeLastName}
        🔗 Username: ${user.username ? '@' + user.username : 'не указан'}
        📅 Зарегистрирован: ${formatDate(user.createdAt)}
        💎 Подписка: ${subscriptionInfo}
        🏷️ Тариф: ${user.subscriptionTier}
        👥 Роль: ${adminStatus} ${isMainAdmin ? '(ГЛАВНЫЙ)' : ''}
        💰 Заработано stars: ${user.earnedStars || 0} ⭐
        📊 Рефералов: ${user.referralCount || 0}
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Выдать подписку", callback_data: `admin_give_30_${userId}` },
              { text: "❌ Удалить подписку", callback_data: `admin_remove_${userId}` }
            ],
            user.isAdmin && !isMainAdmin ? [
              { text: "❌ Убрать админа", callback_data: `admin_remove_admin_${userId}` }
            ] : !user.isAdmin ? [
              { text: "👑 Сделать админом", callback_data: `admin_make_admin_${userId}` }
            ] : [],
            [{ text: "⬅️ Назад", callback_data: "admin_panel" }]
          ].filter(Boolean)
        }
      }
    );
  } catch (error) {
    await ctx.reply("❌ Пользователь не найден.");
  }
}

  async makeAdmin(ctx: Context, userId: number): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    try {
      // Проверяем, что пользователь не пытается изменить главного администратора
      if (userId === MAIN_ADMIN_ID) {
        await ctx.reply("❌ Нельзя изменить статус главного администратора.");
        return;
      }

      await this.usersCollection.makeAdmin(userId);
      const user = await this.usersCollection.getUserById(userId);
      
      await ctx.reply(
        `✅ Пользователь ${user.firstName} (ID: ${user.userId}) теперь администратор.`,
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
            ]
          }
        }
      );
    } catch (error: any) {
      if (error.message.includes("Cannot modify main administrator")) {
        await ctx.reply("❌ Нельзя изменить главного администратора.");
      } else {
        await ctx.reply("❌ Ошибка при назначении администратора. Пользователь не найден.");
      }
    }
  }

  async removeAdmin(ctx: Context, userId: number): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    try {
      // Проверяем, что пользователь не пытается удалить главного администратора
      if (userId === MAIN_ADMIN_ID) {
        await ctx.reply("❌ Нельзя удалить главного администратора.");
        return;
      }

      await this.usersCollection.removeAdmin(userId);
      const user = await this.usersCollection.getUserById(userId);
      
      await ctx.reply(
        `✅ Администратор ${user.firstName} (ID: ${user.userId}) теперь обычный пользователь.`,
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ В админ-панель", callback_data: "admin_panel" }]
            ]
          }
        }
      );
    } catch (error: any) {
      if (error.message.includes("Cannot remove main administrator")) {
        await ctx.reply("❌ Нельзя удалить главного администратора.");
      } else {
        await ctx.reply("❌ Ошибка при удалении администратора. Пользователь не найден.");
      }
    }
  }
}

// Subscription Service
export class SubscriptionService {
  private usersCollection = new UserRepository();

  async checkAccess(userId: number): Promise<boolean> {
    try {
      const hasActiveSubscription = await this.usersCollection.checkSubscription(userId);
      return hasActiveSubscription;
    } catch (error) {
      console.error("Error checking subscription:", error);
      return false;
    }
  }

  async sendSubscriptionInvoice(ctx: Context): Promise<void> {
  const title = "Ежемесячная подписка";
  const description = "Доступ к мониторингу сообщений на 30 дней";
  const payload = "subscription_monthly";
  const price = 49; // Возвращаем 49 Stars

  await ctx.api.sendInvoice(
    ctx.chat!.id,
    title,
    description,
    payload,
    "XTR", // Telegram Stars currency
    [
      {
        label: title,
        amount: price, // 49 Stars
      },
    ],
    {
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false,
      is_flexible: false,
    }
  );
}

  public async activateSubscription(userId: number): Promise<void> {
  try {
    console.log(`Starting subscription activation for user ${userId}`);
    
    const days = 30;
    const tier = "monthly";

    // Проверяем существование пользователя
    const userExists = await this.usersCollection.exists(userId);
    if (!userExists) {
      throw new Error(`User ${userId} does not exist`);
    }

    await this.usersCollection.activateSubscription(userId, days, tier);
    console.log(`Subscription successfully activated for user ${userId}`);
    
  } catch (error) {
    console.error(`Error activating subscription for user ${userId}:`, error);
    throw new Error(`Failed to activate subscription: ${error instanceof Error ? error.message : error}`);
  }
}

  public async applyReferralBonus(userId: number, referralCount: number): Promise<number> {
    const usersCollection = new UserRepository();
    
    let bonusDays = 0;
    if (referralCount === 3) {
      bonusDays = 7;
    } else if (referralCount === 5) {
      bonusDays = 30;
    } else if (referralCount === 10) {
      bonusDays = 180;
    } else if (referralCount === 30) {
      bonusDays = -1; // вечная подписка
    }
    
    if (bonusDays !== 0) {
      await usersCollection.activateSubscription(userId, bonusDays, "referral");
    }
    
    return bonusDays;
  }

}

// Реферальный сервис для обработки выплат
export class ReferralService {
  private usersCollection = new UserRepository();

  // Начисляем 30% от покупки реферала
  public async addReferralEarnings(referrerId: number, purchaseAmount: number): Promise<void> {
    try {
      const earnings = Math.floor(purchaseAmount * 0.3); // 30% от суммы
      const referrer = await this.usersCollection.getUserById(referrerId);
      
      const newEarnedStars = (referrer.earnedStars || 0) + earnings;
      await this.usersCollection.setAttribute(referrerId, 'earnedStars', newEarnedStars);
      
      console.log(`Начислено ${earnings} stars рефереру ${referrerId} за покупку реферала`);
    } catch (error) {
      console.error(`Ошибка при начислении реферального вознаграждения:`, error);
    }
  }

  // Создание заявки на вывод
  public async createWithdrawalRequest(userId: number, amount: number): Promise<boolean> {
    try {
      const user = await this.usersCollection.getUserById(userId);
      
      if (amount < 100) {
        throw new Error("Минимальная сумма вывода - 100 stars");
      }
      
      if (user.earnedStars < amount) {
        throw new Error("Недостаточно stars для вывода");
      }

      // Создаем заявку на вывод
      const request = {
        id: Date.now(),
        userId: userId,
        amount: amount,
        status: 'pending',
        createdAt: new Date().toISOString(),
        userName: `${user.firstName} ${user.lastName || ''}`.trim(),
        username: user.username
      };

      // Обновляем балансы
      const newEarnedStars = user.earnedStars - amount;
      const newPendingWithdrawal = (user.pendingWithdrawal || 0) + amount;
      
      await this.usersCollection.setAttribute(userId, 'earnedStars', newEarnedStars);
      await this.usersCollection.setAttribute(userId, 'pendingWithdrawal', newPendingWithdrawal);

      // Добавляем заявку в историю
      const withdrawalRequests = JSON.parse(user.withdrawalRequests || '[]');
      withdrawalRequests.push(request);
      await this.usersCollection.setAttribute(userId, 'withdrawalRequests', JSON.stringify(withdrawalRequests));

      return true;
    } catch (error) {
      console.error(`Ошибка при создании заявки на вывод:`, error);
      throw error;
    }
  }

  // Получение всех заявок на вывод (для админов)
  public async getPendingWithdrawals(): Promise<any[]> {
    try {
      const allUsers = await this.usersCollection.getAllUsers();
      const pendingRequests: any[] = [];

      for (const user of allUsers) {
        if (user.withdrawalRequests && user.withdrawalRequests !== '[]') {
          const requests = JSON.parse(user.withdrawalRequests);
          const userPendingRequests = requests.filter((req: any) => req.status === 'pending');
          pendingRequests.push(...userPendingRequests);
        }
      }

      return pendingRequests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      console.error('Ошибка при получении заявок на вывод:', error);
      return [];
    }
  }

  // Обработка заявки на вывод админом
  public async processWithdrawal(requestId: number, adminId: number, approve: boolean): Promise<void> {
    try {
      const allUsers = await this.usersCollection.getAllUsers();
      
      for (const user of allUsers) {
        if (user.withdrawalRequests && user.withdrawalRequests !== '[]') {
          const requests = JSON.parse(user.withdrawalRequests);
          const requestIndex = requests.findIndex((req: any) => req.id === requestId);
          
          if (requestIndex !== -1) {
            const request = requests[requestIndex];
            
            if (approve) {
              // Одобряем вывод
              requests[requestIndex].status = 'approved';
              requests[requestIndex].processedAt = new Date().toISOString();
              requests[requestIndex].processedBy = adminId;
              
              const newPendingWithdrawal = (user.pendingWithdrawal || 0) - request.amount;
              const newTotalWithdrawn = (user.totalWithdrawn || 0) + request.amount;
              
              await this.usersCollection.setAttribute(user.userId, 'pendingWithdrawal', newPendingWithdrawal);
              await this.usersCollection.setAttribute(user.userId, 'totalWithdrawn', newTotalWithdrawn);
            } else {
              // Отклоняем вывод - возвращаем stars
              requests[requestIndex].status = 'rejected';
              requests[requestIndex].processedAt = new Date().toISOString();
              requests[requestIndex].processedBy = adminId;
              
              const newEarnedStars = (user.earnedStars || 0) + request.amount;
              const newPendingWithdrawal = (user.pendingWithdrawal || 0) - request.amount;
              
              await this.usersCollection.setAttribute(user.userId, 'earnedStars', newEarnedStars);
              await this.usersCollection.setAttribute(user.userId, 'pendingWithdrawal', newPendingWithdrawal);
            }
            
            await this.usersCollection.setAttribute(user.userId, 'withdrawalRequests', JSON.stringify(requests));
            break;
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при обработке заявки на вывод:', error);
      throw error;
    }
  }
}