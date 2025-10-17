// bot.ts - Главный файл запуска
import dotenv from "dotenv";
dotenv.config();

import { Bot, Context } from "grammy";
import dedent from "dedent";
import { UserRepository, IUserRepository } from './database';
import { AdminService, SubscriptionService, ReferralService } from './services';
import { updateHandlers } from "./handlers";
import { handleCallbackQuery, showMainMenu, showWelcomeMessage } from './ui';
import { ExportService } from './exportService';

// Main Bot Class
class BotInstance {
  private bot: Bot;
  private usersCollection: IUserRepository;
  private subscriptionService = new SubscriptionService();
  private adminService = new AdminService();
  private referralService = new ReferralService();
  private exportService = new ExportService();

  constructor() {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new Error("BOT_TOKEN environment variable is not defined");
    }
    this.bot = new Bot(botToken);
    this.usersCollection = new UserRepository();
  }

  public async run() {
    try {
      this.registerHandlers();
      await this.bot.start({
        onStart: () => console.log("Bot started successfully!")
      });
    } catch (error) {
      console.error("Failed to start bot:", error);
      process.exit(1);
    }
  }

  private registerHandlers() {
    // Оставляем только команду start
    this.bot.command("start", (ctx: Context) => this.startCommandHandler(ctx));
    
    // Обработчик callback-запросов для кнопок
    this.bot.on("callback_query:data", handleCallbackQuery);

    // Обработчики платежей
    this.bot.on("pre_checkout_query", (ctx) => this.handlePreCheckoutQuery(ctx));
    this.bot.on("message:successful_payment", (ctx) => this.handleSuccessfulPayment(ctx));
    
    // Обработчик обычных текстовых сообщений для админских функций и экспорта
    this.bot.on("message:text", (ctx) => this.handleTextCommands(ctx));
    
    updateHandlers.forEach(handler => {
      const middlewares = handler.middlewares ?? [];
      this.bot.on(handler.updateName, ...middlewares, async (ctx: Context) => {
        try {
          await handler.run(ctx);
        } catch (error) {
          console.error(`Error in handler ${handler.constructor.name}:`, error);
        }
      });
    });

    // Error handler
    this.bot.catch((error) => {
      console.error("Bot error:", error);
    });
  }

  private async startCommandHandler(ctx: Context) {
  try {
    if (ctx.from) {
      const botMe = await ctx.api.getMe();
      const userId = ctx.from.id;
      
      // Проверяем, существует ли пользователь
      const userExists = await this.usersCollection.exists(userId);

      await this.usersCollection.create({
        userId: ctx.from.id,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || "",
        username: ctx.from.username || "",
      });

      // Обработка реферальной ссылки
      const startPayload = ctx.match; // Получаем параметр из ссылки
      
      if (startPayload && typeof startPayload === 'string' && startPayload.startsWith('ref_')) {
        const referrerId = parseInt(startPayload.replace('ref_', ''));
        
        if (referrerId && referrerId !== userId) {
          try {
            const referrer = await this.usersCollection.getUserById(referrerId);
            
            // Устанавливаем кто пригласил
            await this.usersCollection.setReferredBy(userId, referrerId);
            
            // Увеличиваем счетчик рефералов
            await this.usersCollection.incrementReferralCount(referrerId);
            
            console.log(`User ${userId} was referred by ${referrerId}`);
            
            // Получаем обновленные данные реферера
            const updatedReferrer = await this.usersCollection.getUserById(referrerId);
            const newCount = updatedReferrer.referralCount;
            
            // Начисляем бонусы в зависимости от количества рефералов
            let bonusDays = 0;
            if (newCount === 3) {
              bonusDays = 7;
            } else if (newCount === 5) {
              bonusDays = 30;
            } else if (newCount === 10) {
              bonusDays = 180;
            } else if (newCount === 30) {
              bonusDays = -1; // вечная подписка
            }
            
            if (bonusDays !== 0) {
              await this.usersCollection.activateSubscription(referrerId, bonusDays, "referral");
              
              // Уведомляем реферера о бонусе
              const bonusText = bonusDays === -1 ? "вечную подписку" : `${bonusDays} дней`;
              await ctx.api.sendMessage(
                referrerId,
                `🎉 Поздравляем! Вы пригласили ${newCount} пользователей и получаете ${bonusText} подписки в подарок!`,
                { parse_mode: "HTML" }
              );
            }
            
          } catch (error) {
            console.log("Referrer not found or error processing referral:", error);
          }
        }
      }

      // Активируем вечную подписку только для админа
      if (await this.adminService.isAdmin(ctx.from.id)) {
        await this.usersCollection.activateSubscription(ctx.from.id, -1, "admin_forever");
      }

      // Отправляем приветственное сообщение
      await showWelcomeMessage(ctx);
    }
  } catch (error: any) {
    console.error("Error in startCommandHandler:", error);
    await ctx.reply("Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.");
  }
}

  private async handlePreCheckoutQuery(ctx: Context) {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      console.error("Error in pre-checkout query:", error);
      await ctx.answerPreCheckoutQuery(false, "Произошла ошибка при обработке платежа");
    }
  }

 private async handleSuccessfulPayment(ctx: Context) {
  try {
    if (!ctx.from || !ctx.message?.successful_payment) return;

    console.log(`Processing payment for user ${ctx.from.id}`);

    // Активируем подписку
    await this.subscriptionService.activateSubscription(ctx.from.id);
    console.log(`Subscription activated for user ${ctx.from.id}`);

    // НОВЫЙ КОД: Начисляем реферальное вознаграждение
    try {
      const user = await this.usersCollection.getUserById(ctx.from.id);
      if (user.referredBy) {
        const purchaseAmount = 49; // Стоимость подписки в stars
        await this.referralService.addReferralEarnings(user.referredBy, purchaseAmount);
        
        console.log(`Реферальное вознаграждение начислено пользователю ${user.referredBy}`);
      }
    } catch (refError) {
      console.error('Ошибка при начислении реферального вознаграждения:', refError);
    }

    // Получаем обновленные данные пользователя
    const usersCollection = new UserRepository();
    const user = await usersCollection.getUserById(ctx.from.id);
    
    // Правильно рассчитываем дни подписки
    const daysLeft = user.subscriptionExpires 
      ? Math.ceil((user.subscriptionExpires - Date.now()) / (1000 * 60 * 60 * 24))
      : 30;

    const expiresDate = user.subscriptionExpires 
      ? new Date(user.subscriptionExpires).toLocaleDateString('ru-RU')
      : 'не определена';

    await ctx.reply(
      dedent`
        ✅ <b>Подписка успешно активирована!</b>
        
        📅 Подписка действует до: ${expiresDate}
        ⏳ Осталось дней: ${daysLeft}
        
        Спасибо за покупку! Теперь вы можете использовать все функции бота.
        
        Для настройки:
        1. Откройте настройки Telegram
        2. Перейдите в <i>Telegram Business -> Чат-боты</i>
        3. Назначьте меня как чат-бота
        
        Используйте кнопку "Моя подписка" чтобы посмотреть статус подписки.
      `,
      { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
            [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );

  } catch (error) {
    console.error("Error handling successful payment:", error);
    
    // Логируем детали ошибки
    console.error("Error details:", {
      userId: ctx.from?.id,
      payment: ctx.message?.successful_payment,
      error: error instanceof Error ? error.message : error
    });

    // Более информативное сообщение об ошибке
    await ctx.reply(
      dedent`
        ❌ Произошла ошибка при активации подписки.
        
        Ваш платеж успешно обработан, но возникла техническая ошибка.
        Пожалуйста, свяжитесь с поддержкой и предоставьте эту информацию:
        
        • ID пользователя: <code>${ctx.from?.id}</code>
        • Время платежа: ${new Date().toLocaleString('ru-RU')}
        
        Мы активируем вашу подписку вручную в кратчайшие сроки.
      `,
      { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📞 Связаться с поддержкой", url: "https://t.me/whocencer" }],
            [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
  }
}

  private async handleTextCommands(ctx: Context) {
  try {
    if (!ctx.from || !ctx.message?.text) return;

    const text = ctx.message.text.trim();
    
    // Проверяем, ожидает ли пользователь ввода суммы для вывода
    const user = await this.usersCollection.getUserById(ctx.from.id);
    const awaitingWithdrawal = await this.usersCollection.getUserAttribute(ctx.from.id, 'awaitingWithdrawalAmount');
    
    if (awaitingWithdrawal) {
      await this.handleWithdrawalAmountInput(ctx, text);
      return;
    }
    
    // Проверяем, является ли пользователь админом для админских команд
    const isAdmin = await this.adminService.isAdmin(ctx.from.id);
    
    // ТЕПЕРЬ проверяем, ожидает ли админ ввода сообщения для рассылки
    const awaitingBroadcast = await this.usersCollection.getUserAttribute(ctx.from.id, 'awaitingBroadcastMessage');
    
    if (awaitingBroadcast) {
      await this.adminService.broadcastMessage(ctx, text);
      await this.usersCollection.setAttribute(ctx.from.id, 'awaitingBroadcastMessage', 0);
      return;
    }

    // Если не админ - выходим (не обрабатываем экспорт)
    if (!isAdmin) return;

    // Обработка выдачи подписки (формат: "123456789 30" или "123456789 -1")
    const subMatch = text.match(/^(\d+)\s+(-?\d+)$/);
    if (subMatch) {
      const targetUserId = parseInt(subMatch[1]);
      const days = parseInt(subMatch[2]);
      
      await this.adminService.giveSubscription(ctx, targetUserId, days);
      return;
    }

    // Обработка удаления подписки (формат: "123456789")
    const userIdMatch = text.match(/^(\d+)$/);
    if (userIdMatch) {
      const targetUserId = parseInt(userIdMatch[1]);
      
      // Проверяем, существует ли пользователь
      try {
        const user = await this.usersCollection.getUserById(targetUserId);
        
        // Показываем информацию о пользователе
        await this.adminService.showUserInfo(ctx, targetUserId);
      } catch (error) {
        await ctx.reply("❌ Пользователь с таким ID не найден.");
      }
      return;
    }

    // Обработка назначения админа (формат: "admin 123456789")
    const makeAdminMatch = text.match(/^admin\s+(\d+)$/);
    if (makeAdminMatch) {
      const targetUserId = parseInt(makeAdminMatch[1]);
      await this.adminService.makeAdmin(ctx, targetUserId);
      return;
    }

    // Обработка снятия админа (формат: "unadmin 123456789")
    const removeAdminMatch = text.match(/^unadmin\s+(\d+)$/);
    if (removeAdminMatch) {
      const targetUserId = parseInt(removeAdminMatch[1]);
      await this.adminService.removeAdmin(ctx, targetUserId);
      return;
    }

    // Если текст не подошел ни под одну админскую команду - игнорируем
    // НЕ ВЫЗЫВАЕМ exportService.exportChatHistory для админов!

  } catch (error) {
    console.error("Error in handleTextCommands:", error);
  }
}

  private async handleWithdrawalAmountInput(ctx: Context, amountText: string) {
  const usersCollection = new UserRepository();
  const referralService = new ReferralService();
  
  // ДОБАВЛЯЕМ ПРОВЕРКУ НА СУЩЕСТВОВАНИЕ ctx.from
  if (!ctx.from) {
    console.error("ctx.from is undefined in handleWithdrawalAmountInput");
    return;
  }
  
  try {
    const amount = parseInt(amountText);
    
    if (isNaN(amount) || amount < 100) {
      await ctx.reply("❌ Неверная сумма. Минимальный вывод - 100 ⭐");
      return;
    }

    const user = await usersCollection.getUserById(ctx.from.id);
    
    if (user.earnedStars < amount) {
      await ctx.reply(`❌ Недостаточно средств. Ваш баланс: ${user.earnedStars} ⭐`);
      return;
    }

    // Создаем заявку на вывод
    await referralService.createWithdrawalRequest(ctx.from.id, amount);
    
    // Сбрасываем флаг ожидания
    await usersCollection.setAttribute(ctx.from.id, 'awaitingWithdrawalAmount', 0);
    
    await ctx.reply(
      dedent`
        ✅ <b>Заявка на вывод создана!</b>
        
        💰 Сумма: ${amount} ⭐
        ⏳ Статус: Ожидает одобрения
        🕐 Вывод будет произведен в течение 24 часов
        
        Спасибо за использование нашего бота! 🚀
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "👥 Реферальная система", callback_data: "referral_system" }],
            [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
    
    // Уведомляем админов о новой заявке
    await this.notifyAdminsAboutWithdrawal(ctx.from.id, amount);
    
  } catch (error: any) {
    await ctx.reply(`❌ Ошибка: ${error.message}`);
  }
}

  private async notifyAdminsAboutWithdrawal(userId: number, amount: number) {
  try {
    const adminService = new AdminService();
    const usersCollection = new UserRepository();
    const allAdmins = await usersCollection.getAllAdmins();
    
    const user = await usersCollection.getUserById(userId);
    const userName = `${user.firstName} ${user.lastName || ''}`.trim();
    const userInfo = user.username ? `@${user.username}` : `ID: ${userId}`;
    
    const notificationText = dedent`
      💰 <b>Новая заявка на вывод</b>
      
      👤 Пользователь: ${userName} (${userInfo})
      💎 Сумма: ${amount} ⭐
      🆔 ID заявки: ${Date.now()}
      
      Для обработки перейдите в админ-панель.
    `;
    
    for (const admin of allAdmins) {
      try {
        await this.bot.api.sendMessage(admin.userId, notificationText, {
          parse_mode: "HTML"
        });
      } catch (error) {
        console.error(`Не удалось уведомить админа ${admin.userId}:`, error);
      }
    }
  } catch (error) {
    console.error("Ошибка при уведомлении админов:", error);
  }
}
}

// Main execution
(async () => {
  try {
    console.log("Starting bot...");
    const bot = new BotInstance();
    await bot.run();
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
})();