import { Context } from "grammy";
import { UserRepository } from "../database/User";

/**
 * ✅ Обработка pre_checkout_query (Telegram Stars перед оплатой)
 */
export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    await ctx.answerPreCheckoutQuery(true);
    console.log("✅ PreCheckoutQuery успешно подтвержден от", ctx.from?.id);
  } catch (error) {
    console.error("❌ Ошибка в handlePreCheckoutQuery:", error);
    await ctx.answerPreCheckoutQuery(false, {
      error_message: "Ошибка при обработке оплаты. Попробуйте позже.",
    });
  }
}

/**
 * ✅ Обработка успешной оплаты (successful_payment)
 */
export async function handleSuccessfulPayment(ctx: Context) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userRepo = new UserRepository();

    // Устанавливаем срок подписки на 30 дней
    const paidUntil = Date.now() + 1000 * 60 * 60 * 24 * 30;

    await userRepo.updateUser(userId, { paidUntil });

    await ctx.reply(
      "💎 Оплата получена! Ваша подписка активна на 30 дней.\nСпасибо за поддержку ❤️"
    );

    console.log(`✅ Пользователь ${userId} оплатил подписку до ${new Date(paidUntil).toLocaleString()}`);
  } catch (error) {
    console.error("❌ Ошибка в handleSuccessfulPayment:", error);
    await ctx.reply("Ошибка при обработке оплаты. Попробуйте позже.");
  }
}
