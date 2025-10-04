import { Context } from "grammy";

export const SUBSCRIPTION_PRICE_STARS = 75; // 75 звёзд в месяц

export async function subscribeCommand(ctx: Context) {
  const priceStars = SUBSCRIPTION_PRICE_STARS;
  const payload = `subscribe_monthly_${ctx.chat?.id}_${Date.now()}`;

  // Счёт на оплату
  const invoice = {
    title: "Подписка на бота (1 месяц)",
    description: "Оплата месячного доступа к премиум-функциям бота (75⭐/мес)",
    payload,
    provider_token: "", // пусто — для Telegram Stars (XTR)
    currency: "XTR",
    prices: [
      { label: "Подписка на месяц", amount: priceStars }
    ],
    start_parameter: `subscribe_${Date.now()}`
  };

  try {
    await ctx.api.sendInvoice(ctx.chat!.id, invoice);
  } catch (err) {
    console.error("Ошибка при отправке счёта:", err);
    await ctx.reply("❌ Не удалось отправить счёт. Попробуйте позже или свяжитесь с админом.");
  }
}
