// handlers.ts - Обработчики событий бота
import { Bot, Context, FilterQuery, Middleware } from "grammy";
import dedent from "dedent";
import { 
  UserRepository, 
  MessagesRepository, 
  IUserRepository, 
  IMessagesRepository 
} from "./database";
import { SubscriptionService, MarketApiClient, sleep, formatDate } from "./services";

// Command handlers
export async function getUserId(ctx: Context) {
  try {
    await ctx.editMessageText(
      `User ID: <code>${ctx.businessMessage?.chat.id}</code>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in getUserId:", error);
  }
}

export async function listedGiftsHandler(ctx: Context, chatId: number) {
  if (chatId) {
    try {
      await ctx.editMessageText("🔍 Fetching gifts...");

      const marketApi = new MarketApiClient();
      const listedGifts = await marketApi.getUserListedGifts(chatId);
      
      const gifts = listedGifts?.data || listedGifts || [];
      const giftCount = Array.isArray(gifts) ? gifts.length : 0;
      
      if (giftCount > 0) {
        await ctx.editMessageText(
          `✅ User has ${giftCount} listed gifts on Tonnel Market.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "👀 View", url: `https://t.me/tonnel_network_bot/gifts?startapp=profile_${chatId}` }],
                [{ text: "🎁 Buy and sell gifts", url: "https://t.me/tonnel_network_bot/gifts?startapp=ref_915471265" }]
              ]
            },
            parse_mode: "HTML"
          }
        );
      } else {
        await ctx.editMessageText(
          "😕 <i>User has no listed gifts on Tonnel.</i>",
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("Error fetching listed gifts:", error);
      await ctx.editMessageText("❌ Error fetching listed gifts.");
    }
  }
}

export async function userCommandsHandler(ctx: Context, next: () => void) {
  try {
    if (!ctx.businessMessage) {
      return next();
    }

    const businessConnection = await ctx.getBusinessConnection();
    const user_chat_id = businessConnection.user_chat_id;
    const businessMessage = ctx.businessMessage;

    if (businessMessage?.from?.id === user_chat_id) {
      const command = businessMessage.text?.split(" ")[0].toLowerCase();

      switch (command) {
        case ".listed_gifts":
          await listedGiftsHandler(ctx, businessMessage.chat.id);
          break;
        case ".id":
          await getUserId(ctx);
          break;
        default:
          return next();
      }
    } else {
      next();
    }
  } catch (error) {
    console.error("Error in userCommandsHandler:", error);
    next();
  }
}

// Update handlers interface and implementations
export interface IUpdateHandler {
  updateName: FilterQuery | FilterQuery[];
  middlewares?: Array<Middleware<Context>>;
  run: (ctx: Context) => Promise<void> | void;
}

export class BusinessConnectionHandler implements IUpdateHandler {
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "business_connection";

  public async run(ctx: Context) {
    try {
      const businessConnectionId = ctx.businessConnection?.id;
      
      if (ctx.businessConnection && ctx.businessConnection.user_chat_id) {
        await ctx.api.sendMessage(
          ctx.businessConnection.user_chat_id,
          `🥳 Бот начал свою работу!`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("Error in BusinessConnectionHandler:", error);
    }
  }
}

export class BusinessImageMessageHandler implements IUpdateHandler {
  private usersCollection = new UserRepository();
  private messagesCollection = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "business_message:photo";

  public async run(ctx: Context) {
    try {
      const businessConnection = await ctx.getBusinessConnection();
      const user_chat_id = businessConnection.user_chat_id;

      if (ctx.businessMessage?.photo && ctx.from) {
        // ИГНОРИРУЕМ сообщения от самого пользователя (владельца бота)
        if (ctx.from.id === user_chat_id) {
          return;
        }

        // Проверяем подписку пользователя
        const hasSubscription = await this.subscriptionService.checkAccess(user_chat_id);
        if (!hasSubscription) {
          console.log(`User ${user_chat_id} doesn't have active subscription, skipping message processing`);
          return;
        }

        const { file_id } = ctx.businessMessage.photo[0];
        
        // Create user if not exists
        await this.usersCollection.createOrUpdate({
          userId: user_chat_id,
          firstName: "Business User",
          lastName: "",
          username: ""
        });

        await this.usersCollection.setAttribute(user_chat_id, "lastReceiveMessageAt", Date.now());

        await this.messagesCollection.create({
          messageId: ctx.businessMessage.message_id,
          userId: user_chat_id,
          text: ctx.businessMessage.caption || "",
          media: file_id,
          senderId: ctx.from.id,
          senderName: ctx.from.first_name,
          senderUsername: ctx.from.username,
        });
      }
    } catch (error) {
      console.error("Error in BusinessImageMessageHandler:", error);
    }
  }
}

export class BusinessMessageHandler implements IUpdateHandler {
  private usersCollection: IUserRepository = new UserRepository();
  private messagesCollection: IMessagesRepository = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "business_message:text";
  public middlewares?: Middleware<Context>[] = [userCommandsHandler];

  public async run(ctx: Context): Promise<void> {
    try {
      const businessConnection = await ctx.getBusinessConnection();
      const user_chat_id = businessConnection.user_chat_id;
      const businessConnectionId = ctx.businessMessage?.business_connection_id;
      
      if (businessConnectionId && ctx.businessMessage && ctx.from) {
        // ИГНОРИРУЕМ сообщения от самого пользователя (владельца бота)
        if (ctx.from.id === user_chat_id) {
          return;
        }

        // Проверяем подписку пользователя
        const hasSubscription = await this.subscriptionService.checkAccess(user_chat_id);
        if (!hasSubscription) {
          console.log(`User ${user_chat_id} doesn't have active subscription, skipping message processing`);
          return;
        }

        // Create user if not exists first
        await this.usersCollection.createOrUpdate({
          userId: user_chat_id,
          firstName: "Business User", 
          lastName: "",
          username: ""
        });

        // Then update the attribute
        await this.usersCollection.setAttribute(user_chat_id, "lastReceiveMessageAt", Date.now());
        
        if (ctx.businessMessage.text) {
          const { text, message_id } = ctx.businessMessage;
          await this.messagesCollection.create({
            messageId: message_id,
            userId: user_chat_id,
            text,
            senderId: ctx.from.id,
            senderName: ctx.from.first_name,
            senderUsername: ctx.from.username,
          });
        }
      }
    } catch (error: any) {
      console.error("Error in BusinessMessageHandler:", error);
    }
  }
}

export class DeletedBusinessMessageHandler implements IUpdateHandler {
  private messagesCollection = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "deleted_business_messages";

  private async processDeletedMessage(
    ctx: Context, 
    messageId: number, 
    userChatId: number, 
  ): Promise<void> {
    try {
      const deletedMessage = await this.messagesCollection.getById(messageId);
      
      if (!deletedMessage) {
        return;
      }

      // ИГНОРИРУЕМ удаление собственных сообщений пользователя
      if (deletedMessage.senderId === userChatId) {
        return;
      }

      await this.messagesCollection.setAttribute(messageId, "isDeleted", true);
      await this.messagesCollection.setAttribute(messageId, "deletedAt", Date.now());
      
      // СРАЗУ отправляем содержимое удаленного сообщения
      let text = '';
      if (deletedMessage.media) {
        text = dedent`
          🗑️ <b>Удаленное сообщение с медиа</b>
          
          👤 <b>Пользователь:</b> <a href="t.me/${deletedMessage.senderUsername || "whocencer"}">${deletedMessage.senderName}</a>
          🆔 <b>ID:</b> <code>${deletedMessage.senderId}</code>
          📅 <b>Отправлено:</b> ${formatDate(deletedMessage.sentAt)}
          🗑️ <b>Удалено:</b> ${formatDate(deletedMessage.deletedAt || Date.now())}
          
          📝 <b>Текст сообщения:</b>
          <blockquote>${deletedMessage.text || "Без текста"}</blockquote>
        `;
      } else {
        text = dedent`
          🗑️ <b>Удаленное сообщение</b>
          
          👤 <b>Пользователь:</b> <a href="t.me/${deletedMessage.senderUsername || "whocencer"}">${deletedMessage.senderName}</a>
          🆔 <b>ID:</b> <code>${deletedMessage.senderId}</code>
          📅 <b>Отправлено:</b> ${formatDate(deletedMessage.sentAt)}
          🗑️ <b>Удалено:</b> ${formatDate(deletedMessage.deletedAt || Date.now())}
          
          📝 <b>Текст сообщения:</b>
          <blockquote>${deletedMessage.text || "Без текста"}</blockquote>
        `;
      }

      // Отправляем сразу полное сообщение без кнопки
      const notificationMessage = await ctx.api.sendMessage(
        userChatId,
        text,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true }
        }
      );

      // Сохраняем ID уведомления для возможности редактирования
      await this.messagesCollection.setAttribute(messageId, "notificationMessageId", notificationMessage.message_id);
      
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
    }
  }

  public async run(ctx: Context) {
    try {
      const businessConnectionId = ctx.deletedBusinessMessages?.business_connection_id;

      if (businessConnectionId) {
        const businessConnection = await ctx.api.getBusinessConnection(businessConnectionId);
        const user_chat_id = businessConnection.user_chat_id;
        const { message_ids } = ctx.deletedBusinessMessages;

        // Проверяем подписку пользователя
        const hasSubscription = await this.subscriptionService.checkAccess(user_chat_id);
        if (!hasSubscription) {
          console.log(`User ${user_chat_id} doesn't have active subscription, skipping deleted message processing`);
          return;
        }

        for (const messageId of message_ids) {
          await this.processDeletedMessage(ctx, messageId, user_chat_id);
          await sleep(500);
        }
      }
    } catch (error) {
      console.error("Error in DeletedBusinessMessageHandler:", error);
    }
  }
}

export class EditedBusinessMessageHandler implements IUpdateHandler {
  private messagesCollection = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "edited_business_message";

  public async run(ctx: Context) {
    try {
      const businessConnectionId = ctx.editedBusinessMessage?.business_connection_id;
      
      if (businessConnectionId && ctx.editedBusinessMessage && ctx.from) {
        const businessConnection = await ctx.api.getBusinessConnection(businessConnectionId);
        const receiverId = businessConnection.user_chat_id;
        const { message_id, text: newMessageText, from } = ctx.editedBusinessMessage;

        // Проверяем подписку пользователя
        const hasSubscription = await this.subscriptionService.checkAccess(receiverId);
        if (!hasSubscription) {
          console.log(`User ${receiverId} doesn't have active subscription, skipping edited message processing`);
          return;
        }

        // ИГНОРИРУЕМ редактирование собственных сообщений пользователя
        if (from?.id === receiverId) {
          return;
        }
        
        const oldMessage = await this.messagesCollection.getById(message_id);
      
        if (newMessageText && oldMessage) {
          // ИГНОРИРУЕМ редактирование собственных сообщений
          if (oldMessage.senderId === receiverId) {
            return;
          }

          await this.messagesCollection.messageEdited(
            message_id,
            oldMessage.text,
            newMessageText
          );

          // СРАЗУ отправляем полную информацию об редактировании
          const editedMessage = await this.messagesCollection.getById(message_id);
          if (!editedMessage) return;

          const lastEdit = editedMessage.editedMessages[editedMessage.editedMessages.length - 1];
          const text = dedent`
            ✏️ <b>Сообщение отредактировано</b>
            
            👤 <b>Пользователь:</b> <a href="t.me/${editedMessage.senderUsername || "whocencer"}">${editedMessage.senderName}</a>
            🆔 <b>ID:</b> <code>${editedMessage.senderId}</code>
            📅 <b>Отправлено:</b> ${formatDate(editedMessage.sentAt)}
            ✏️ <b>Отредактировано:</b> ${formatDate(editedMessage.editedAt || Date.now())}
            
            📝 <b>Было:</b>
            <blockquote>${lastEdit?.oldMessageText || editedMessage.text}</blockquote>
            
            📝 <b>Стало:</b>
            <blockquote>${editedMessage.text}</blockquote>
          `;

          // Отправляем сразу полное сообщение без кнопки
          await ctx.api.sendMessage(
            receiverId,
            text,
            {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true }
            }
          );
        }
      }
    } catch (error) {
      console.error("Error in EditedBusinessMessageHandler:", error);
    }
  }
}

export const updateHandlers: IUpdateHandler[] = [
  new BusinessMessageHandler(),
  new EditedBusinessMessageHandler(),
  new DeletedBusinessMessageHandler(),
  new BusinessConnectionHandler(),
  new BusinessImageMessageHandler()
]