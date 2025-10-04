// src/commands/subscribe.ts
import { Context } from "grammy";
import { UserRepository } from "../database/User";

export const SUBSCRIPTION_PRICE_STARS = 75;
const ADMIN_ID = 123456789; // 🔹 Укажи свой Telegram ID здесь

export async function subscribeCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  // ✅ Если админ — активируем подписку бесплатно
  if (userId === ADMIN_ID) {
    const userRepo = new UserRepository();
    const paidUntil = Date.now() + 1000 * 60 * 60 * 24 * 365; // 1 год бесплатно
    await userRepo.updateUser(userId, { paidUntil });

    await ctx.reply("💎 Вы — администратор. Подписка активирована бесплатно на 1 год.");
    return;
  }

  // 💰 Обычная логика оплаты для других пользователей
  const priceStars = SUBSCRIPTION_PRICE_STARS;
  const payload = `subscribe_monthly_${userId}_${Date.now()}`;

  const chatId = ctx.chat?.id ?? ctx.from?.id;
  if (!chatId) {
    console.error("subscribeCommand: не удалось определить chatId", ctx.update);
    try {
      await (ctx as any).answerCallbackQuery?.({
        text: "Не удалось открыть оплату",
        show_alert: true,
      });
    } catch {}
    return;
  }

  const invoice = {
    title: "Подписка на бота (1 месяц)",
    description: "Оплата месячного доступа к премиум-функциям бота (75⭐/мес)",
    payload,
    currency: "XTR", // Telegram Stars
    prices: [{ label: "Подписка на месяц", amount: priceStars }],
  };

  try {
    await ctx.api.sendInvoice(chatId, invoice);
  } catch (err) {
    console.error("subscribeCommand: ошибка отправки счета:", err);
    try {
      await ctx.reply("❌ Не удалось открыть оплату. Проверь, что бот подключён к Stars.");
    } catch {}
  }
}
