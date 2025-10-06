// ui.ts - UI функции и меню
import { Context } from "grammy";
import dedent from "dedent";
import { UserRepository } from "./database";
import { AdminService, SubscriptionService, formatDate } from "./services";

// Обработчик callback-запросов для кнопок
export async function handleCallbackQuery(ctx: Context) {
  const adminService = new AdminService();
  const subscriptionService = new SubscriptionService();
  
  try {
    const data = ctx.callbackQuery?.data;

    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }

    // Обработка основных кнопок
    if (data === 'main_menu') {
      await showMainMenu(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'my_subscription') {
      await showMySubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'buy_subscription') {
      await buySubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'pay_subscription') {
      await subscriptionService.sendSubscriptionInvoice(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'help') {
      await showHelp(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'referral_system') {
      await showReferralSystem(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'check_giftboom_sub') {
      await checkGiftBoomSubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    // Админские кнопки
    if (data.startsWith('admin_')) {
      const isAdmin = ctx.from ? await adminService.isAdmin(ctx.from.id) : false;
      if (!isAdmin) {
        await ctx.answerCallbackQuery("❌ Нет доступа");
        return;
      }
      
      if (data === 'admin_panel') {
        await adminService.showAdminPanel(ctx);
      } else if (data === 'admin_users') {
        await adminService.showUsersList(ctx);
      } else if (data === 'admin_admins') {
        await adminService.showAdminsList(ctx);
      } else if (data === 'admin_stats') {
        await adminService.showAdminPanel(ctx);
      } else if (data === 'admin_give_sub_menu') {
        await adminService.showGiveSubscriptionMenu(ctx);
      } else if (data === 'admin_remove_sub_menu') {
        await adminService.showRemoveSubscriptionMenu(ctx);
      } else if (data === 'admin_user_info_menu') {
        await adminService.showUserInfoMenu(ctx);
      } else if (data === 'admin_manage_admins') {
        await adminService.showManageAdminsMenu(ctx);
      } else if (data === 'admin_make_admin_menu') {
        await adminService.showMakeAdminMenu(ctx);
      } else if (data === 'admin_remove_admin_menu') {
        await adminService.showRemoveAdminMenu(ctx);
      } else if (data.startsWith('admin_give_')) {
        const parts = data.split('_');
        const days = parseInt(parts[2]);
        const userId = parseInt(parts[3]);
        await adminService.giveSubscription(ctx, userId, days);
      } else if (data.startsWith('admin_remove_')) {
        const parts = data.split('_');
        const userId = parseInt(parts[2]);
        if (parts.length === 3) {
          // admin_remove_123 - удаление подписки
          await adminService.removeSubscription(ctx, userId);
        } else if (parts.length === 4 && parts[1] === 'remove' && parts[2] === 'admin') {
          // admin_remove_admin_123 - удаление админа
          const userId = parseInt(parts[3]);
          await adminService.removeAdmin(ctx, userId);
        }
      } else if (data.startsWith('admin_make_admin_')) {
        const userId = parseInt(data.split('_')[3]);
        await adminService.makeAdmin(ctx, userId);
      } else if (data.startsWith('admin_user_')) {
        const userId = parseInt(data.split('_')[2]);
        await adminService.showUserInfo(ctx, userId);
      }
      
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Error in callback handler:", error);
    await ctx.answerCallbackQuery("Произошла ошибка");
  }
}

// Функции для обработки основных кнопок
export async function showMainMenu(ctx: Context) {
  const usersCollection = new UserRepository();
  const adminService = new AdminService();
  
  if (!ctx.from) return;

  const hasActiveSubscription = await usersCollection.checkSubscription(ctx.from.id);
  const isAdmin = await adminService.isAdmin(ctx.from.id);

  let message = '';
  if (hasActiveSubscription) {
    message = dedent`
      🏠 <b>Главное меню</b>
      
      ✅ <b>Ваша подписка активна!</b>
      
      Вы можете использовать все функции бота.
    `;
  } else {
    message = dedent`
      🏠 <b>Главное меню</b>
      
      ❌ <b>Требуется подписка</b>
      
      Для использования бота необходимо приобрести подписку.
    `;
  }

  const keyboard = [];
  
  if (isAdmin) {
    keyboard.push([{ text: "👑 Админ-панель", callback_data: "admin_panel" }]);
  }
  
  keyboard.push([{ text: "💎 Моя подписка", callback_data: "my_subscription" }]);
  
  keyboard.push(
    [{ text: "🎁 Реферальная система", callback_data: "referral_system" }],
    [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
    [{ text: "❓ Помощь", callback_data: "help" }]
  );

  try {
    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    await ctx.reply(message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

export async function showMySubscription(ctx: Context) {
  const usersCollection = new UserRepository();
  
  if (!ctx.from) return;

  try {
    const user = await usersCollection.getUserById(ctx.from.id);
    const hasActiveSubscription = await usersCollection.checkSubscription(ctx.from.id);

    if (hasActiveSubscription && user.subscriptionExpires) {
      const expiresDate = new Date(user.subscriptionExpires);
      const daysLeft = Math.ceil((user.subscriptionExpires - Date.now()) / (1000 * 60 * 60 * 24));
      
      let subscriptionType = "Ежемесячный";
      if (user.subscriptionTier === "admin_forever") {
        subscriptionType = "👑 Вечная (Админ)";
      } else if (user.subscriptionTier === "admin") {
        subscriptionType = "⚡ Выданная админом";
      } else if (user.subscriptionTier === "giftboom_bonus") {
        subscriptionType = "🎁 Бонус за подписку";
      } else if (user.subscriptionTier === "monthly") {
        subscriptionType = "💎 Оплаченная";
      }
      
      await ctx.editMessageText(
        dedent`
          ✅ <b>Ваша подписка активна</b>
          
          💎 Тариф: ${subscriptionType}
          📅 Действует до: ${expiresDate.toLocaleDateString('ru-RU')}
          ⏳ Осталось дней: ${daysLeft}
          
          Спасибо за использование нашего бота! 🚀
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Продлить подписку", callback_data: "buy_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    } else {
      await ctx.editMessageText(
        dedent`
          ❌ <b>Подписка не активна</b>
          
          Для использования бота необходимо приобрести подписку.
          
          💰 Стоимость: 49 Stars (≈ 1$)
          ⏰ Срок: 30 дней
          
          После покупки подписки вы получите полный доступ к функциям бота.
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error("Error in showMySubscription:", error);
    await ctx.reply("Произошла ошибка при получении информации о подписке.");
  }
}

export async function buySubscription(ctx: Context) {
  const subscriptionService = new SubscriptionService();
  
  try {
    await ctx.editMessageText(
      dedent`
        💎 <b>Ежемесячная подписка</b>
        
        💰 Стоимость: 49 Stars (≈ 1$)
        ⏰ Срок: 30 дней
        
        <b>Что вы получите:</b>
        • Уведомления об удаленных сообщениях
        • Уведомления об отредактированных сообщениях
        • Мониторинг всех входящих сообщений
        
        Нажмите кнопку ниже для оплаты.
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Оплатить 49 ⭐", callback_data: "pay_subscription" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Error in buySubscription:", error);
  }
}

export async function showHelp(ctx: Context) {
  const adminService = new AdminService();
  const isAdmin = ctx.from ? await adminService.isAdmin(ctx.from.id) : false;

  let helpText = dedent`
    ❓ <b>Помощь</b>

    

    <b>Как настроить бота:</b>
    1. Откройте настройки Telegram
    2. Перейдите в <i>Telegram Business -> Чат-боты</i>
    3. Назначьте меня как чат-бота

    <b>Функции бота:</b>
    • Уведомления об удаленных сообщениях
    • Уведомления об edited сообщениях
    • Мониторинг всех входящих сообщений
  `;

  if (isAdmin) {
    helpText += '\n\n👑 <b>У вас есть доступ к админ-панели</b>';
  }

  const keyboard = [
    [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
    [{ text: "🎁 Реферальная система", callback_data: "referral_system" }],
    [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
    [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
  ];

  if (isAdmin) {
    keyboard.unshift([{ text: "👑 Админ-панель", callback_data: "admin_panel" }]);
  }

  try {
    await ctx.editMessageText(helpText, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    await ctx.reply(helpText, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

export async function showReferralSystem(ctx: Context) {
  const usersCollection = new UserRepository();
  
  if (!ctx.from) return;

  try {
    const user = await usersCollection.getUserById(ctx.from.id);
    const hasUsedBonus = await usersCollection.hasUsedGiftBoomBonus(ctx.from.id);
    const hasActiveSubscription = await usersCollection.checkSubscription(ctx.from.id);

    let message = '';
    
    if (hasUsedBonus) {
      message = dedent`
        🎁 <b>Реферальная система</b>

        ❌ Вы уже использовали бонус за подписку на Gift Boom.

        Спасибо за вашу поддержку! ❤️
      `;
    } else if (hasActiveSubscription) {
      message = dedent`
        🎁 <b>Реферальная система</b>

        ✅ У вас уже есть активная подписка!

        Спасибо за использование нашего бота! 🚀
      `;
    } else {
      message = dedent`
        🎁 <b>Реферальная система</b>

        🔥 <b>Получите +7 дней бесплатно!</b>

        Для получения бонуса:
        1. Подпишитесь на @giftboom_official
        2. Нажмите кнопку "✅ Проверить подписку"
        3. Получите +7 дней к пробному периоду

        ⚠️ Можно использовать только 1 раз
      `;
    }

    const keyboard = [];
    
    if (!hasUsedBonus && !hasActiveSubscription) {
      keyboard.push([{ text: "📢 Перейти в @giftboom", url: "https://t.me/giftboom_official" }]);
      keyboard.push([{ text: "✅ Проверить подписку", callback_data: "check_giftboom_sub" }]);
    }
    
    keyboard.push([{ text: "⬅️ Главное меню", callback_data: "main_menu" }]);

    try {
      await ctx.editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      await ctx.reply(message, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
      });
    }
  } catch (error) {
    console.error("Error in showReferralSystem:", error);
  }
}

export async function checkGiftBoomSubscription(ctx: Context) {
  const usersCollection = new UserRepository();
  
  if (!ctx.from) return;

  try {
    // РЕАЛЬНАЯ ПРОВЕРКА ПОДПИСКИ - бот теперь админ в канале
    const GIFTBOOM_CHANNEL = '@giftboom_official';
    let isSubscribed = false;

    try {
      // Получаем информацию о статусе пользователя в канале
      const chatMember = await ctx.api.getChatMember(GIFTBOOM_CHANNEL, ctx.from.id);
      
      // Проверяем статус подписки
      isSubscribed = ['creator', 'administrator', 'member'].includes(chatMember.status);
      
      console.log(`User ${ctx.from.id} subscription status: ${chatMember.status}, isSubscribed: ${isSubscribed}`);
    } catch (error: any) {
      console.error('Error checking subscription:', error);
      
      // Если ошибка "user not found" или "chat not found" - пользователь не подписан
      if (error.description?.includes('user not found') || 
          error.description?.includes('chat not found') ||
          error.description?.includes('USER_NOT_PARTICIPANT') ||
          error.code === 400) {
        isSubscribed = false;
      } else {
        // Другие ошибки - показываем сообщение об ошибке
        await ctx.editMessageText(
          "❌ <b>Ошибка при проверке подписки</b>\n\nПожалуйста, попробуйте позже.",
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Проверить подписку", callback_data: "check_giftboom_sub" }],
                [{ text: "⬅️ Назад", callback_data: "referral_system" }]
              ]
            }
          }
        );
        return;
      }
    }

    if (!isSubscribed) {
      await ctx.editMessageText(
        dedent`
          ❌ <b>Вы не подписаны на @giftboom_official</b>

          Пожалуйста, подпишитесь на канал и нажмите кнопку "🔄 Проверить подписку" еще раз.

          📢 Канал: @giftboom_official

          ⚠️ <b>Важно:</b> После подписки может потребоваться несколько секунд для обновления статуса.
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Перейти в @giftboom", url: "https://t.me/giftboom_official" }],
              [{ text: "🔄 Проверить подписку", callback_data: "check_giftboom_sub" }],
              [{ text: "⬅️ Назад", callback_data: "referral_system" }]
            ]
          }
        }
      );
      return;
    }

    // Проверяем, не использовал ли уже бонус
    const hasUsedBonus = await usersCollection.hasUsedGiftBoomBonus(ctx.from.id);
    if (hasUsedBonus) {
      await ctx.editMessageText(
        "❌ Вы уже использовали этот бонус ранее. Можно использовать только 1 раз.",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
      return;
    }

    // Получаем текущего пользователя чтобы проверить существующую подписку
    const user = await usersCollection.getUserById(ctx.from.id);
    const currentTime = Date.now();
    const bonusDays = 7;
    
    let newExpires: number;

    // Если у пользователя уже есть активная подписка, добавляем дни к текущей дате окончания
    if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires > currentTime) {
      // Добавляем дни к существующей дате окончания
      newExpires = user.subscriptionExpires + (bonusDays * 24 * 60 * 60 * 1000);
    } else {
      // Если подписки нет или она истекла, создаем новую от текущей даты
      newExpires = currentTime + (bonusDays * 24 * 60 * 60 * 1000);
    }

    await usersCollection.setAttribute(ctx.from.id, 'subscriptionActive', 1);
    await usersCollection.setAttribute(ctx.from.id, 'subscriptionExpires', newExpires);
    await usersCollection.setAttribute(ctx.from.id, 'subscriptionTier', 'giftboom_bonus');
    await usersCollection.markGiftBoomBonusUsed(ctx.from.id);

    // Получаем обновленные данные пользователя для отображения
    const updatedUser = await usersCollection.getUserById(ctx.from.id);
    const totalDays = Math.ceil((newExpires - currentTime) / (1000 * 60 * 60 * 24));

    await ctx.editMessageText(
      dedent`
        🎉 <b>Бонус активирован!</b>

        ✅ Вам добавлено +7 дней бесплатного периода!

        📅 Теперь ваша подписка действует до: ${new Date(newExpires).toLocaleDateString('ru-RU')}
        ⏳ Всего дней подписки: ${totalDays}

        Спасибо за подписку на @giftboom_official! 🚀
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );

  } catch (error) {
    console.error("Error in checkGiftBoomSubscription:", error);
    await ctx.editMessageText(
      "❌ Произошла ошибка при активации бонуса. Пожалуйста, попробуйте позже.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Попробовать снова", callback_data: "check_giftboom_sub" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
  }
}