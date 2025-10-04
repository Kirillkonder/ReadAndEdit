import { UserRepository } from "../database/User";

export async function handleSuccessfulPayment(ctx: any) {
  const userId = ctx.from.id;
  const repo = new UserRepository();

  const paidUntil = Date.now() + 30 * 24 * 60 * 60 * 1000; // +30 дней
  await repo.updateUserPayment(userId, paidUntil);

  await ctx.reply("✅ Оплата прошла успешно! Подписка активна на 30 дней 💎");

  // уведомление админу
  const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
  if (ADMIN_ID) {
    await ctx.api.sendMessage(
      ADMIN_ID,
      `💰 Новый платёж!\nПользователь ${userId} оплатил подписку до ${new Date(
        paidUntil
      ).toLocaleString()}`
    );
  }
}
