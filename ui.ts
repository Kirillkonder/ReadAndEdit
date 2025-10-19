// ui.ts - UI функции и меню
import { Context } from "grammy";
import dedent from "dedent";
import { UserRepository, MessagesRepository } from "./database";
import { AdminService, SubscriptionService, formatDate, ReferralService } from "./services";
import { InputFile } from "grammy";
import * as fs from "fs";
import { ExportService } from './exportService';

// Обработчик callback-запросов для кнопок
export async function handleCallbackQuery(ctx: Context) {
  console.log(`📲 CALLBACK RECEIVED: ${ctx.callbackQuery?.data}`);
  
  const adminService = new AdminService();
  const subscriptionService = new SubscriptionService();
  const referralService = new ReferralService();
  const messagesCollection = new MessagesRepository();
  
  try {
    const data = ctx.callbackQuery?.data;
    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }

    // ОБРАБОТКА VIDEO_FILE - ПЕРВОЙ!
    if (data.startsWith('show_video_file_')) {
      console.log(`🎬 VIDEO FILE BUTTON CLICKED: ${data}`);
      const messageId = parseInt(data.replace('show_video_file_', ''));
      console.log(`🔍 Looking for message ID: ${messageId}`);
      
      try {
        const message = await messagesCollection.getById(messageId);
        console.log(`📋 Message from DB:`, {
          found: !!message,
          messageId: message?.messageId,
          hasVideoFile: message?.hasVideoFile,
          videoFile: message?.videoFile ? `EXISTS (${message.videoFile})` : 'NULL',
          senderName: message?.senderName
        });
        
        if (message && message.videoFile) {
          console.log(`📤 Sending video with file_id: ${message.videoFile}`);
          
          try {
            await ctx.api.sendVideo(
              ctx.from!.id,
              message.videoFile,
              {
                caption: `🎬 Удаленное видео от ${message.senderName}`,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
                  ]
                }
              }
            );
            console.log(`✅ Video sent successfully`);
            await ctx.answerCallbackQuery("🎬 Отправляю видео...");
          } catch (sendError) {
            console.error(`❌ Error sending video:`, sendError);
            await ctx.answerCallbackQuery("❌ Ошибка отправки видео");
          }
        } else {
          console.log(`❌ Video file not found in DB for message ${messageId}`);
          await ctx.answerCallbackQuery("❌ Видео не найдено в базе");
        }
      } catch (error) {
        console.error("💥 Error showing video file:", error);
        await ctx.answerCallbackQuery("❌ Ошибка при загрузке видео");
      }
      return;
    }

    // ОСТАЛЬНЫЕ ОБРАБОТЧИКИ
    if (data.startsWith('play_voice_')) {
      const messageId = parseInt(data.replace('play_voice_', ''));
      
      try {
        const message = await messagesCollection.getById(messageId);
        
        if (message && message.voice) {
          await ctx.api.sendVoice(
            ctx.from!.id,
            message.voice,
            {
              caption: `🎤 Голосовое сообщение от ${message.senderName}`,
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
                ]
              }
            }
          );
          await ctx.answerCallbackQuery("🎤 Отправляю голосовое сообщение...");
        } else {
          await ctx.answerCallbackQuery("❌ Голосовое сообщение не найдено");
        }
      } catch (error) {
        console.error("Error playing voice message:", error);
        await ctx.answerCallbackQuery("❌ Ошибка при воспроизведении");
      }
      return;
    }

    if (data.startsWith('show_photo_')) {
      const messageId = parseInt(data.replace('show_photo_', ''));
      
      try {
        const message = await messagesCollection.getById(messageId);
        
        if (message && message.media) {
          await ctx.api.sendPhoto(
            ctx.from!.id,
            message.media,
            {
              caption: `🖼️ Удаленная фотография от ${message.senderName}`,
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
                ]
              }
            }
          );
          await ctx.answerCallbackQuery("🖼️ Отправляю фотографию...");
        } else {
          await ctx.answerCallbackQuery("❌ Фотография не найдена");
        }
      } catch (error) {
        console.error("Error showing photo:", error);
        await ctx.answerCallbackQuery("❌ Ошибка при загрузке фото");
      }
      return;
    }

    if (data.startsWith('show_video_')) {
      const messageId = parseInt(data.replace('show_video_', ''));
      
      try {
        const message = await messagesCollection.getById(messageId);
        
        if (message && message.video) {
          await ctx.api.sendVideoNote(
            ctx.from!.id,
            message.video,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
                ]
              }
            }
          );
          await ctx.answerCallbackQuery("🎥 Отправляю видеосообщение...");
        } else {
          await ctx.answerCallbackQuery("❌ Видеосообщение не найдено");
        }
      } catch (error) {
        console.error("Error showing video message:", error);
        await ctx.answerCallbackQuery("❌ Ошибка при загрузке видео");
      }
      return;
    }

    // Обработка основных кнопок
    if (data === 'main_menu') {
      await showMainMenu(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'bot_demo') {
      await showBotDemo(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'show_instructions') {
      await showConnectionInstructions(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'my_subscription') {
      await showMySubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'admin_fix_subscriptions') {
    await adminService.fixSubscriptionStatuses(ctx);
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

    if (data === 'referral_system') {
      await showReferralSystem(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'giftboom_system') {
      await showGiftBoomSystem(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'check_giftboom_sub') {
      await checkGiftBoomSubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'support_cooperation') {
      await showSupportCooperation(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'export_chat') {
      const exportService = new ExportService();
      await exportService.startExportProcess(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    // НОВЫЕ ОБРАБОТЧИКИ ДЛЯ ВЫВОДА СРЕДСТВ
    if (data === 'request_withdrawal') {
      await handleWithdrawalRequest(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'admin_withdrawals') {
      await showAdminWithdrawals(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('admin_approve_withdrawal_')) {
      const requestId = parseInt(data.replace('admin_approve_withdrawal_', ''));
      await adminApproveWithdrawal(ctx, requestId);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('admin_reject_withdrawal_')) {
      const requestId = parseInt(data.replace('admin_reject_withdrawal_', ''));
      await adminRejectWithdrawal(ctx, requestId);
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
      } else if (data === 'admin_broadcast_menu') {
        await adminService.showBroadcastMenu(ctx);
      } else if (data.startsWith('admin_give_')) {
        const parts = data.split('_');
        const days = parseInt(parts[2]);
        const userId = parseInt(parts[3]);
        await adminService.giveSubscription(ctx, userId, days);
      } else if (data.startsWith('admin_remove_')) {
        const parts = data.split('_');
        const userId = parseInt(parts[2]);
        if (parts.length === 3) {
          await adminService.removeSubscription(ctx, userId);
        } else if (parts.length === 4 && parts[1] === 'remove' && parts[2] === 'admin') {
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

// Приветственное сообщение при команде /start
export async function showWelcomeMessage(ctx: Context) {
  if (!ctx.from) return;

  try {
    const welcomeMessage = dedent`
      👋 <b>Привет! Я - бот для мониторинга сообщений в Telegram Business</b>
      
      🔔 Что я умею:
      • Уведомляю об удаленных сообщениях
      • Уведомляю об отредактированных сообщениях
      • Сохраняю историю всех изменений
      • Отслеживаю голосовые сообщения
      • Отслеживаю фотографии
      • Отслеживаю видеосообщения (кружки)
      • Отслеживаю обычные видео
      
      🚀 Я помогу вам не пропустить важные изменения в переписке с клиентами!
      
      Нажмите кнопку ниже, чтобы увидеть демонстрацию работы бота.
    `;

    await ctx.reply(welcomeMessage, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎬 Демонстрация бота", callback_data: "bot_demo" }]
        ]
      }
    });
  } catch (error) {
    console.error("Error in showWelcomeMessage:", error);
  }
}

// Функция для показа демонстрации бота
export async function showBotDemo(ctx: Context) {
  if (!ctx.from) return;

  try {
    // Отправляем сообщение о загрузке
    await ctx.editMessageText("📹 Загружаю демонстрационные видео...");

    // Проверяем наличие обоих файлов
    const editVideoPath = "./img/edit.mp4";
    const deleteVideoPath = "./img/delete.mp4";
    
    if (fs.existsSync(editVideoPath) && fs.existsSync(deleteVideoPath)) {
      // Отправляем оба видео в одном сообщении
      await ctx.api.sendMediaGroup(ctx.from.id, [
        {
          type: "video",
          media: new InputFile(editVideoPath),
          caption: "🎬 Демонстрация #1: Как бот реагирует на редактирование сообщений"
        },
        {
          type: "video",
          media: new InputFile(deleteVideoPath),
          caption: "🎬 Демонстрация #2: Как бот реагирует на удаление сообщений"
        }
      ]);

      // Отправляем финальное сообщение с кнопкой
      await ctx.api.sendMessage(
        ctx.from.id,
        "✅ Демонстрация завершена!\n\nТеперь вы знаете, как работает бот 🚀",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📖 Как подключить бота", callback_data: "show_instructions" }]
            ]
          }
        }
      );
    } else {
      console.error("Video files not found");
      await ctx.reply("❌ Видео-файлы не найдены.");
    }

  } catch (error) {
    console.error("Error in showBotDemo:", error);
    await ctx.reply("❌ Произошла ошибка при загрузке демонстрационных видео.");
  }
}

// Функция для показа инструкции по подключению бота
export async function showConnectionInstructions(ctx: Context) {
  if (!ctx.from) return;

  try {
    const instructionsMessage = dedent`
      📖 <b>Как подключить бота</b>
      
      <b>Шаг 1:</b> Откройте настройки Telegram
      <b>Шаг 2:</b> Перейдите в раздел <i>Telegram Business</i>
      <b>Шаг 3:</b> Выберите <i>Чат-боты</i>
      <b>Шаг 4:</b> Назначьте меня как чат-бота
      
      ✅ После этого я начну отслеживать все изменения в ваших сообщениях!
      
      💡 <b>Важно:</b> Для использования всех функций необходима активная подписка.
    `;

    await ctx.editMessageText(instructionsMessage, {
      parse_mode: "HTML"
    });

    // Отправляем второе сообщение с главным меню
    await showMainMenu(ctx);

  } catch (error) {
    console.error("Error in showConnectionInstructions:", error);
    await ctx.reply("❌ Произошла ошибка при отображении инструкций.");
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
      
      <b>Для настройки:</b>
      1. Откройте настройки Telegram
      2. Перейдите в <i>Telegram Business -> Чат-боты</i>
      3. Назначьте меня как чат-бота
    `;
  } else {
    message = dedent`
      🏠 <b>Главное меню</b>
      
      ❌ <b>Требуется подписка</b>
      
      Для использования бота необходимо приобрести подписку.
      
      <b>Для настройки:</b>
      1. Откройте настройки Telegram
      2. Перейдите в <i>Telegram Business -> Чат-боты</i>
      3. Назначьте меня как чат-бота
    `;
  }

  const keyboard = [];
  
  if (isAdmin) {
    keyboard.push([{ text: "👑 Админ-панель", callback_data: "admin_panel" }]);
  }
  
  keyboard.push([{ text: "💎 Моя подписка", callback_data: "my_subscription" }]);
  
  keyboard.push(
    [{ text: "👥 Реферальная система", callback_data: "referral_system" }],
    [{ text: "💾 Сохранить переписку", callback_data: "export_chat" }],
    [{ text: "🎁 Бесплатная подписка", callback_data: "giftboom_system" }],
    [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
    [{ text: "📞 Поддержка/Сотрудничество", callback_data: "support_cooperation" }]
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

// Новая функция для показа информации о поддержке и сотрудничестве
export async function showSupportCooperation(ctx: Context) {
  if (!ctx.from) return;

  try {
    const supportMessage = dedent`
      📞 <b>Поддержка и Сотрудничество</b>

      По всем вопросам, связанным с работой бота, подпиской или сотрудничеством, обращайтесь к нашему менеджеру:

      👤 <b>Менеджер:</b> @manager_ReadAndEdit

      📧 <b>Что можно обсудить:</b>
      • Технические проблемы с ботом
      • Вопросы по подписке и оплате
      • Предложения по сотрудничеству
      • Рекламные интеграции
      • Любые другие вопросы

      Мы всегда рады помочь и ответить на все ваши вопросы! 🚀
    `;

    try {
      await ctx.editMessageText(supportMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Написать менеджеру", url: "https://t.me/manager_ReadAndEdit" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      });
    } catch (error) {
      await ctx.reply(supportMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Написать менеджеру", url: "https://t.me/manager_ReadAndEdit" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      });
    }
  } catch (error) {
    console.error("Error in showSupportCooperation:", error);
  }
}

// Новая функция для отправки сообщения о реферальной системе
export async function showReferralSystemMessage(ctx: Context) {
  const usersCollection = new UserRepository();
  
  if (!ctx.from) return;

  try {
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

        ✅ У вас уже есть активная подписку!

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
    
    keyboard.push([{ text: "⬅️ Назад", callback_data: "main_menu" }]);

    await ctx.api.sendMessage(
      ctx.from.id,
      message,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  } catch (error) {
    console.error("Error in showReferralSystemMessage:", error);
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
      } else if (user.subscriptionTier === "referral") {
        subscriptionType = "👥 Реферальная";
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
          
          💰 Стоимость: 49 Stars
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
        
        💰 Стоимость: 49 Stars
        ⏰ Срок: 30 дней
        
        <b>Что вы получите:</b>
        • Уведомления об удаленных сообщениях
        • Уведомления об отредактированных сообщениях
        • Мониторинг всех входящих сообщений
        • Отслеживание голосовых сообщений
        • Отслеживание фотографий
        • Отслеживание видеосообщений (кружков)
        • Отслеживание обычных видео
        
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

export async function showGiftBoomSystem(ctx: Context) {
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

        ✅ У вас уже есть активная подписку!

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

// Новая функция для реферальной системы
export async function showReferralSystem(ctx: Context) {
  const usersCollection = new UserRepository();
  const referralService = new ReferralService();
  
  if (!ctx.from) return;

  try {
    const user = await usersCollection.getUserById(ctx.from.id);
    
    // Генерируем реферальную ссылку если её нет
    let referralLink = user.referralLink;
    if (!referralLink) {
      // ИСПРАВЛЕНО: правильный формат ссылки
      referralLink = `https://t.me/${ctx.me.username}?start=ref_${ctx.from.id}`;
      await usersCollection.setReferralLink(ctx.from.id, referralLink);
    }

    const referralCount = user.referralCount || 0;
    const earnedStars = user.earnedStars || 0;
    const pendingWithdrawal = user.pendingWithdrawal || 0;
    const totalWithdrawn = user.totalWithdrawn || 0;
    
    // Определяем бонусы
    const bonuses = [
      { count: 3, days: 7, achieved: referralCount >= 3 },
      { count: 5, days: 30, achieved: referralCount >= 5 },
      { count: 10, days: 180, achieved: referralCount >= 10 },
      { count: 30, days: -1, achieved: referralCount >= 30, text: "навсегда" }
    ];

    let message = dedent`
      👥 <b>Реферальная система</b>

      🔗 <b>Ваша реферальная ссылка:</b>
      <code>${referralLink}</code>

      📊 <b>Статистика:</b>
      • Приглашено пользователей: ${referralCount}
      • Заработано stars: ${earnedStars} ⭐
      • На выводе: ${pendingWithdrawal} ⭐
      • Всего выведено: ${totalWithdrawn} ⭐

      💰 <b>Условия заработка:</b>
      • 30% от каждой покупки вашего реферала
      • Минимальный вывод: 100 ⭐
      • Вывод в течение 24 часов после одобрения

      🎁 <b>Бонусы за приглашения:</b>
    `;

    bonuses.forEach(bonus => {
      const status = bonus.achieved ? "✅" : "⏳";
      const daysText = bonus.days === -1 ? "навсегда" : `${bonus.days} дней`;
      message += `\n${status} За ${bonus.count} человек - ${daysText}`;
    });

    message += "\n\n⚠️ <b>Важно:</b> Бонусы начисляются только если пользователь перешел по вашей ссылке и активировал бота.";

    // ИСПРАВЛЕНО: правильное формирование ссылки для кнопки "Поделиться"
    const shareText = "Привет! Попробуй этого бота для мониторинга сообщений в Telegram Business!";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

    // ИСПРАВЛЕНО: явно указываем тип массива кнопок
    const keyboard: any[] = [
      [{ text: "📤 Поделиться ссылкой", url: shareUrl }],
      [{ text: "💰 Запросить вывод", callback_data: "request_withdrawal" }], // КНОПКА ВСЕГДА ВИДНА
      [{ text: "🔄 Обновить статистику", callback_data: "referral_system" }],
      [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
    ];

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

// Функции для обработки вывода средств
async function handleWithdrawalRequest(ctx: Context) {
  const usersCollection = new UserRepository();
  const referralService = new ReferralService();
  
  if (!ctx.from) return;

  try {
    const user = await usersCollection.getUserById(ctx.from.id);
    const earnedStars = user.earnedStars || 0;

    // УБИРАЕМ ПРОВЕРКУ НА 100 ЗВЕЗД - КНОПКА ВСЕГДА ДОСТУПНА
    if (earnedStars < 100) {
      await ctx.editMessageText(
        `❌ <b>Недостаточно средств для вывода</b>\n\nМинимальная сумма вывода: 100 ⭐\n\nВаш баланс: ${earnedStars} ⭐\n\nПриглашайте больше друзей чтобы заработать больше stars! 🚀`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📤 Поделиться ссылкой", callback_data: "referral_system" }],
              [{ text: "⬅️ Назад к реферальной системе", callback_data: "referral_system" }]
            ]
          }
        }
      );
      return;
    }

    await ctx.editMessageText(
      dedent`
        💰 <b>Запрос на вывод средств</b>
        
        💎 Доступно для вывода: ${earnedStars} ⭐
        💳 Минимальная сумма: 100 ⭐
        
        Введите сумму для вывода (от 100 до ${earnedStars}):
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Отмена", callback_data: "referral_system" }]
          ]
        }
      }
    );

    // Сохраняем состояние ожидания ввода суммы
    await usersCollection.setAttribute(ctx.from.id, 'awaitingWithdrawalAmount', 1);
    
  } catch (error) {
    console.error("Error in handleWithdrawalRequest:", error);
    await ctx.editMessageText("❌ Произошла ошибка при запросе вывода");
  }
}

async function showAdminWithdrawals(ctx: Context) {
  const adminService = new AdminService();
  const referralService = new ReferralService();
  
  if (!ctx.from) return;

  try {
    const isAdmin = await adminService.isAdmin(ctx.from.id);
    if (!isAdmin) {
      await ctx.answerCallbackQuery("❌ Нет доступа");
      return;
    }

    const pendingRequests = await referralService.getPendingWithdrawals();
    
    if (pendingRequests.length === 0) {
      await ctx.editMessageText(
        "📋 <b>Заявки на вывод</b>\n\nНет pending заявок на вывод.",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Обновить", callback_data: "admin_withdrawals" }],
              [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
            ]
          }
        }
      );
      return;
    }

    let message = `📋 <b>Заявки на вывод</b> (всего: ${pendingRequests.length})\n\n`;
    
    pendingRequests.forEach((request, index) => {
      const userInfo = request.username ? `@${request.username}` : `ID: ${request.userId}`;
      message += dedent`
        ${index + 1}. <b>Заявка #${request.id}</b>
           👤 ${request.userName} (${userInfo})
           💰 ${request.amount} ⭐
           📅 ${new Date(request.createdAt).toLocaleString('ru-RU')}
        
      `;
    });

    const keyboard = [];
    
    pendingRequests.forEach(request => {
      keyboard.push([
        { 
          text: `✅ Одобрить #${request.id}`, 
          callback_data: `admin_approve_withdrawal_${request.id}` 
        },
        { 
          text: `❌ Отклонить #${request.id}`, 
          callback_data: `admin_reject_withdrawal_${request.id}` 
        }
      ]);
    });

    keyboard.push(
      [{ text: "🔄 Обновить", callback_data: "admin_withdrawals" }],
      [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
    );

    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
    
  } catch (error) {
    console.error("Error in showAdminWithdrawals:", error);
    await ctx.editMessageText("❌ Ошибка при загрузке заявок на вывод");
  }
}

async function adminApproveWithdrawal(ctx: Context, requestId: number) {
  const referralService = new ReferralService();
  const adminService = new AdminService();
  
  if (!ctx.from) return;

  try {
    const isAdmin = await adminService.isAdmin(ctx.from.id);
    if (!isAdmin) {
      await ctx.answerCallbackQuery("❌ Нет доступа");
      return;
    }

    await referralService.processWithdrawal(requestId, ctx.from.id, true);
    
    await ctx.editMessageText(
      "✅ <b>Заявка на вывод одобрена</b>\n\nСредства переведены пользователю.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад к заявкам", callback_data: "admin_withdrawals" }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    await ctx.answerCallbackQuery("❌ Ошибка при одобрении заявки");
  }
}

async function adminRejectWithdrawal(ctx: Context, requestId: number) {
  const referralService = new ReferralService();
  const adminService = new AdminService();
  
  if (!ctx.from) return;

  try {
    const isAdmin = await adminService.isAdmin(ctx.from.id);
    if (!isAdmin) {
      await ctx.answerCallbackQuery("❌ Нет доступа");
      return;
    }

    await referralService.processWithdrawal(requestId, ctx.from.id, false);
    
    await ctx.editMessageText(
      "❌ <b>Заявка на вывод отклонена</b>\n\nСредства возвращены на баланс пользователя.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Назад к заявкам", callback_data: "admin_withdrawals" }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error("Error rejecting withdrawal:", error);
    await ctx.answerCallbackQuery("❌ Ошибка при отклонении заявки");
  }
}