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
    const activeSubscriptions = totalUsers.filter(user => user.subscriptionActive).length;
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
            [{ text: "🔄 Обновить статистику", callback_data: "admin_stats" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
  }

  async showUsersList(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    const users = await this.usersCollection.getAllUsers();
    
    let message = `👥 <b>Список пользователей</b> (всего: ${users.length})\n\n`;
    
    users.slice(0, 50).forEach((user, index) => {
      const status = user.subscriptionActive ? "✅" : "❌";
      const adminStatus = user.isAdmin ? "👑" : "";
      const username = user.username ? `@${user.username}` : "нет username";
      message += `${index + 1}. ${status} ${adminStatus} ${user.firstName} (ID: ${user.userId}) - ${username}\n`;
    });

    if (users.length > 50) {
      message += `\n... и еще ${users.length - 50} пользователей`;
    }

    await ctx.reply(message, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Назад в админ-панель", callback_data: "admin_panel" }]
        ]
      }
    });
  }

  async showAdminsList(ctx: Context): Promise<void> {
    if (!await this.isAdmin(ctx.from!.id)) return;

    const admins = await this.usersCollection.getAllAdmins();
    
    let message = `👑 <b>Список администраторов</b> (всего: ${admins.length})\n\n`;
    
    admins.forEach((admin, index) => {
      const mainAdmin = admin.userId === MAIN_ADMIN_ID ? " [ГЛАВНЫЙ]" : "";
      const username = admin.username ? `@${admin.username}` : "нет username";
      message += `${index + 1}. ${admin.firstName} (ID: ${admin.userId}) - ${username}${mainAdmin}\n`;
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
      const hasActiveSubscription = await this.usersCollection.checkSubscription(userId);
      
      let subscriptionInfo = "❌ Нет активной подписки";
      if (hasActiveSubscription && user.subscriptionExpires) {
        const expiresDate = new Date(user.subscriptionExpires);
        const daysLeft = Math.ceil((user.subscriptionExpires - Date.now()) / (1000 * 60 * 60 * 24));
        subscriptionInfo = `✅ Активна (осталось ${daysLeft} дней, до ${expiresDate.toLocaleDateString('ru-RU')})`;
      }

      const adminStatus = user.isAdmin ? "👑 Администратор" : "👤 Пользователь";
      const isMainAdmin = userId === MAIN_ADMIN_ID;

      await ctx.reply(
        dedent`
          👤 <b>Информация о пользователе</b>
          
          🆔 ID: <code>${user.userId}</code>
          📛 Имя: ${user.firstName} ${user.lastName || ''}
          🔗 Username: ${user.username ? '@' + user.username : 'не указан'}
          📅 Зарегистрирован: ${formatDate(user.createdAt)}
          💎 Подписка: ${subscriptionInfo}
          🏷️ Тариф: ${user.subscriptionTier}
          👥 Роль: ${adminStatus} ${isMainAdmin ? '(ГЛАВНЫЙ)' : ''}
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