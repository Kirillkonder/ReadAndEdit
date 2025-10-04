import { Context } from "grammy";
import { UserRepository } from "../database/User";

export async function showAdminPanel(ctx: Context) {
  const repo = new UserRepository();

  const users = await repo.getAllUsers();
  const total = users.length;

  const paidUsers = users.filter((u: any) => u.paidUntil && u.paidUntil > Date.now());
  const activeCount = paidUsers.length;

  const paidList =
    paidUsers.length > 0
      ? paidUsers.map((u: any) => `• ${u.userId}`).join("\n")
      : "— никто не оплатил —";

  await ctx.reply(
    `📊 <b>Статистика бота:</b>\n\n👥 Всего пользователей: ${total}\n💎 Активных подписчиков: ${activeCount}\n\n🧾 Список активных:\n${paidList}`,
    { parse_mode: "HTML" }
  );
}
