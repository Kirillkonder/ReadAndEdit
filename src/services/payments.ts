import { Context } from "grammy";
import { UserRepository } from "../database/User/repository";
import { getEnvVariable } from "../utils/getEnvVariable";

const ADMIN_ID = Number(getEnvVariable("ADMIN_ID") || 0);
const userRepo = new UserRepository();

// Когда Телеграм присылает pre_checkout_query (перед оплатой)
export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    const query = (ctx.update as any).pre_checkout_query;
    if (query && query.id) {
      await ctx.api.answerPreCheckoutQuery(query.id, { ok: true });
    }
  } catch (err) {
    console.error("Ошибка pre_checkout_query:", err);
  }
}

// Когда оплата прошла успешно
export async function handleSuccessfulPayment(ctx: Context) {
  const payment = (ctx.message as any).successful_payment;
  if (!payment) return;

  const from = ctx.from!;
  const userId = from.id;
  const now = Date.now();
  const paidUntil = now + 30 * 24 * 60 * 60 * 1000; // +30 дней

  try {
    await userRepo.setAttribute(userId, "paidUntil", paidUntil);

    await ctx.reply("✅ Спасибо! Доступ активирован на 30 дней.");

    // Уведомляем админа
    if (ADMIN_ID) {
      const text = `💸 Пользователь @${from.username || "без_username"} (ID: ${userId}) оплатил подписку на месяц. Сумма: ${payment.total_amount} ⭐`;
      await ctx.api.sendMessage(ADMIN_ID, text);
    }
  } catch (err) {
    console.error("Ошибка при обработке successful_payment:", err);
  }
}
