import dotenv from "dotenv";
dotenv.config();

import { Bot, Context, InlineKeyboard } from "grammy";
import dedent from "dedent";

import { getEnvVariable } from "./utils/getEnvVariable";
import { UserRepository, type IUserRepository } from "./database/User";
import { updateHandlers } from "./updates";

import { subscribeCommand } from "./commands/subscribe";
import { handlePreCheckoutQuery, handleSuccessfulPayment } from "./services/payments";
import { showAdminPanel } from "./commands/adminPanel";

export default class BotInstance {
  private bot: Bot = new Bot(getEnvVariable("BOT_TOKEN"));
  private usersCollection: IUserRepository = new UserRepository();

  public async run() {
    this.registerHandlers();
    await this.bot.start({
      onStart: () => console.log("✅ Bot started successfully!"),
    });
  }

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

    // --- подписка и платежи Telegram Stars ---
    this.bot.command("subscribe", async (ctx) => {
      if (!ctx.chat || ctx.chat.type !== "private") {
        return ctx.reply("Используй эту команду только в личном чате с ботом.");
      }
      await subscribeCommand(ctx as any);
    });

    this.bot.on("pre_checkout_query", async (ctx) => {
      await handlePreCheckoutQuery(ctx as any);
    });

    this.bot.on("message", async (ctx) => {
      if ((ctx.message as any).successful_payment) {
        await handleSuccessfulPayment(ctx as any);
      }
    });

    // --- ⚙️ Админ-панель ---
    this.bot.command("admin", async (ctx) => {
      const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
      if (ctx.from?.id !== ADMIN_ID)
        return ctx.reply("❌ Только админ может использовать эту команду.");

      await showAdminPanel(ctx as any);
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

        const keyboard = new InlineKeyboard()
          .text("💎 Оплатить подписку", "pay")
          .row();

        const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
        if (ctx.from.id === ADMIN_ID) {
          keyboard.text("⚙️ Админ-панель", "admin_panel");
        }

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
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );

        // обработка кнопок
        this.bot.callbackQuery("pay", async (cbCtx) => {
          await subscribeCommand(cbCtx as any);
        });

        this.bot.callbackQuery("admin_panel", async (cbCtx) => {
          await showAdminPanel(cbCtx as any);
        });

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
        /admin — админ-панель  
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
