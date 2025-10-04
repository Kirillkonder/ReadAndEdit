import dotenv from "dotenv";
dotenv.config();

import { Bot, Context } from "grammy";
import dedent from "dedent";

import { getEnvVariable } from "./utils/getEnvVariable";
import { UserRepository, type IUserRepository } from "./database/User";
import { updateHandlers } from "./updates";

// === новые импорты ===
import { subscribeCommand } from "./commands/subscribe";
import { handlePreCheckoutQuery, handleSuccessfulPayment } from "./services/payments";
// ======================

export default class BotInstance {
  private bot: Bot = new Bot(getEnvVariable("BOT_TOKEN"));
  private usersCollection: IUserRepository = new UserRepository();

  constructor() {}

  public async run() {
    this.registerHandlers();
    await this.bot.start({
      onStart: () => console.log("✅ Bot started successfully!"),
    });
  }

  // 👇👇 вот тут все команды и обработчики
  private registerHandlers() {
    // --- стандартные команды ---
    this.bot.command("start", (ctx: Context) => this.startCommandHandler(ctx));
    this.bot.command("help", (ctx: Context) => this.helpCommandHandler(ctx));
    this.bot.command("donate", (ctx: Context) => this.donateCommandHandler(ctx));

    // --- обработчики из updates (твои уже существующие) ---
    updateHandlers.forEach((handler) => {
      const middlewares = handler.middlewares ?? [];
      this.bot.on(
        handler.updateName,
        ...middlewares,
        async (ctx: Context) => handler.run(ctx)
      );
    });

    // --- 🔥 добавляем подписку и платежи Telegram Stars / XTR ---
    // Команда /subscribe — покупка подписки
    this.bot.command("subscribe", async (ctx) => {
      if (!ctx.chat || ctx.chat.type !== "private") {
        return ctx.reply("Используй эту команду только в личном чате с ботом.");
      }
      await subscribeCommand(ctx as any);
    });

    // pre_checkout_query (Telegram присылает перед оплатой)
    this.bot.on("pre_checkout_query", async (ctx) => {
      await handlePreCheckoutQuery(ctx as any);
    });

    // успешная оплата (Telegram присылает вместе с message)
    this.bot.on("message", async (ctx) => {
      if ((ctx.message as any).successful_payment) {
        await handleSuccessfulPayment(ctx as any);
      }
    });

    // Команда /ispaid <id> — только для админа
    this.bot.command("ispaid", async (ctx) => {
      const fromId = ctx.from?.id;
      const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
      if (fromId !== ADMIN_ID) {
        return ctx.reply("❌ Только админ может использовать эту команду.");
      }

      const parts = ctx.message?.text?.split(" ");
      if (!parts || !parts[1])
        return ctx.reply("Использование: /ispaid <userId>");

      const userId = Number(parts[1]);
      const repo = new (await import("./database/User/repository")).UserRepository();

      try {
        const user = await repo.getUserById(userId);
        const paidUntil = (user as any).paidUntil || 0;
        const active = paidUntil > Date.now();
        await ctx.reply(
          `🧾 Пользователь ${userId}\nСтатус: ${
            active ? "✅ Активен" : "❌ Неактивен"
          }\nОплачен до: ${new Date(paidUntil).toLocaleString()}`
        );
      } catch {
        await ctx.reply("Пользователь не найден.");
      }
    });
  }

  // ===== стандартные методы команд =====

  private async startCommandHandler(ctx: Context) {
    if (ctx.from) {
      try {
        const botMe = await ctx.api.getMe();

        await this.usersCollection.create({
          userId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
        });

        await ctx.reply(
          dedent`
            Привет! 👋  
            Я бот, который уведомляет, если кто-то удалил или изменил сообщение в чате.

            ⚙️ Чтобы подключить меня:
            1. Открой настройки Telegram Business
            2. Перейди в <i>Chatbots</i>
            3. Добавь меня (@${botMe.username}) как чат-бота

            Используй /help чтобы увидеть команды.
          `,
          { parse_mode: "HTML" }
        );
      } catch (error: any) {
        console.error("Ошибка в startCommandHandler:", error);
        await ctx.reply("Произошла ошибка. Попробуйте позже.");
      }
    }
  }

  private async helpCommandHandler(ctx: Context) {
    await ctx.reply(
      dedent`
        📘 Доступные команды:

        /start — начать работу  
        /subscribe — оплатить подписку (75⭐ / месяц)  
        /ispaid <id> — (только админ) проверить оплату  
        /help — показать помощь
      `,
      { parse_mode: "HTML" }
    );
  }

  private async donateCommandHandler(ctx: Context) {
    const donationAmountStr = ctx.match;
    const donationAmount = Number(donationAmountStr);

    if (isNaN(donationAmount) || donationAmount <= 1) {
      await ctx.reply(
        "Укажи корректную сумму. Пример:\n<code>/donate 25</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    if (ctx.chat) {
      await ctx.api.sendInvoice(ctx.chat.id, {
        title: "Donation",
        description: "Support the bot ❤️",
        payload: "donation",
        provider_token: "",
        currency: "XTR",
        prices: [{ label: "Donation", amount: donationAmount }],
      });
    }
  }
}
