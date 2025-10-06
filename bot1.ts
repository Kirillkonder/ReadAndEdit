// bot.ts
import dotenv from "dotenv";
dotenv.config();

import { Bot, Context, FilterQuery, Middleware } from "grammy";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import dedent from "dedent";
import fs from "fs";

// Admin ID - главный администратор (нельзя удалить)
const MAIN_ADMIN_ID = 842428912;

// SQLite Database setup
class SQLiteDatabase {
  private db: any = null;

  async connect(): Promise<any> {
    if (!this.db) {
      this.db = await open({
        filename: "./bot.db",
        driver: sqlite3.Database
      });

      // Create tables
      await this.createTables();
      console.log("Connected to SQLite database");
    }
    return this.db;
  }

  private async createTables(): Promise<void> {
    // Создаем таблицу users
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        userId INTEGER PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT,
        username TEXT,
        createdAt INTEGER NOT NULL,
        lastReceiveMessageAt INTEGER,
        subscriptionActive INTEGER DEFAULT 0,
        subscriptionExpires INTEGER,
        subscriptionTier TEXT DEFAULT 'free',
        isAdmin INTEGER DEFAULT 0,
        trialUsed INTEGER DEFAULT 0
      )
    `);

    // Создаем таблицу messages с проверкой существующих столбцов
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        messageId INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        media TEXT,
        userId INTEGER NOT NULL,
        senderId INTEGER NOT NULL,
        senderName TEXT NOT NULL,
        senderUsername TEXT,
        isEdited INTEGER DEFAULT 0,
        isDeleted INTEGER DEFAULT 0,
        hasMedia INTEGER DEFAULT 0,
        editedAt INTEGER,
        deletedAt INTEGER,
        sentAt INTEGER NOT NULL,
        editedMessages TEXT DEFAULT '[]',
        notificationMessageId INTEGER
      )
    `);

    // Проверяем и добавляем столбец notificationMessageId если его нет
    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN notificationMessageId INTEGER");
      console.log("Column notificationMessageId added to messages table");
    } catch (error: any) {
      // Столбец уже существует, игнорируем ошибку
      if (!error.message.includes("duplicate column name")) {
        console.log("Column notificationMessageId already exists");
      }
    }

    // Проверяем и добавляем столбцы подписки если их нет
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN subscriptionActive INTEGER DEFAULT 0");
      console.log("Column subscriptionActive added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column subscriptionActive already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN subscriptionExpires INTEGER");
      console.log("Column subscriptionExpires added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column subscriptionExpires already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN subscriptionTier TEXT DEFAULT 'free'");
      console.log("Column subscriptionTier added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column subscriptionTier already exists");
      }
    }

    // Добавляем столбец isAdmin если его нет
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0");
      console.log("Column isAdmin added to users table");
      
      // Устанавливаем главного администратора
      await this.db.run(
        "UPDATE users SET isAdmin = 1 WHERE userId = ?",
        [MAIN_ADMIN_ID]
      );
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column isAdmin already exists");
      }
    }

    // Добавляем столбец trialUsed если его нет
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN trialUsed INTEGER DEFAULT 0");
      console.log("Column trialUsed added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column trialUsed already exists");
      }
    }
  }
}

// Database types and classes
interface IUser {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  createdAt: number;
  lastReceiveMessageAt?: number;
  subscriptionActive: boolean;
  subscriptionExpires?: number;
  subscriptionTier: string;
  isAdmin: boolean;
  trialUsed: boolean;
}

interface CreateUserDto {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

interface IUserRepository {
  create(userData: CreateUserDto): Promise<void>;
  exists(userId: number, throwError?: boolean): Promise<boolean>;
  getUserById(userId: number): Promise<IUser>;
  setAttribute(userId: number, key: string, value: any, returnResult?: boolean): Promise<IUser | void>;
  createOrUpdate(userData: CreateUserDto): Promise<void>;
  checkSubscription(userId: number): Promise<boolean>;
  activateSubscription(userId: number, days: number, tier: string): Promise<void>;
  activateTrial(userId: number): Promise<boolean>;
  hasUsedTrial(userId: number): Promise<boolean>;
  getAllUsers(): Promise<IUser[]>;
  getAllAdmins(): Promise<IUser[]>;
  makeAdmin(userId: number): Promise<void>;
  removeAdmin(userId: number): Promise<void>;
  isAdmin(userId: number): Promise<boolean>;
}

interface IMessage {
  messageId: number;
  text: string;
  media?: string;
  userId: number;
  senderId: number;
  senderName: string;
  senderUsername?: string;
  isEdited: boolean;
  isDeleted: boolean;
  hasMedia: boolean;
  editedAt?: number;
  deletedAt?: number;
  sentAt: number;
  editedMessages: Array<{ oldMessageText: string, editedAt?: number }>;
  notificationMessageId?: number;
}

interface CreateMessageDto {
  messageId: number;
  text: string;
  media?: string;
  userId: number;
  senderId: number;
  senderName: string;
  senderUsername?: string;
}

interface IMessagesRepository {
  create(message: CreateMessageDto): Promise<IMessage>;
  getById(messageId: number, throwError?: boolean): Promise<IMessage | null>;
  setAttribute(messageId: number, key: string, value: any, returnResult?: boolean): Promise<IMessage | void | null>;
  exists(messageId: number, throwError?: boolean): Promise<boolean>;
  messageEdited(messageId: number, oldMessageText: string, newMessageText: string): Promise<void>;
}

class UserRepository implements IUserRepository {
  private db: SQLiteDatabase = new SQLiteDatabase();

  public async exists(userId: number, throwError: boolean = false): Promise<boolean> {
    const database = await this.db.connect();
    const user = await database.get('SELECT userId FROM users WHERE userId = ?', userId);
    
    if (user) {
      return true;
    } else {
      if (throwError) {
        throw new Error(`User with id ${userId} does not exist`);
      }
      return false;
    }
  }
  
  public async create(userData: CreateUserDto): Promise<void> {
    const database = await this.db.connect();
    
    const userExists = await this.exists(userData.userId, false);
    if (!userExists) {
      // Автоматически делаем главного администратора админом
      const isAdmin = userData.userId === MAIN_ADMIN_ID ? 1 : 0;
      
      await database.run(
        `INSERT INTO users (userId, firstName, lastName, username, createdAt, subscriptionActive, subscriptionTier, isAdmin, trialUsed) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userData.userId, userData.firstName, userData.lastName || null, userData.username || null, Date.now(), 0, 'free', isAdmin, 0]
      );
      console.log(`User ${userData.userId} created successfully`);
    } else {
      console.log(`User ${userData.userId} already exists`);
    }
  }

  public async createOrUpdate(userData: CreateUserDto): Promise<void> {
    const database = await this.db.connect();
    
    const userExists = await this.exists(userData.userId, false);
    if (!userExists) {
      await this.create(userData);
    } else {
      // Update user info if needed
      await database.run(
        `UPDATE users SET firstName = ?, lastName = ?, username = ? WHERE userId = ?`,
        [userData.firstName, userData.lastName || null, userData.username || null, userData.userId]
      );
    }
  }

  public async getUserById(userId: number): Promise<IUser> {
    const database = await this.db.connect();
    const user = await database.get(
      'SELECT * FROM users WHERE userId = ?', 
      userId
    );
    
    if (!user) {
      throw new Error(`User with id ${userId} does not exist`);
    }

    return {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName || undefined,
      username: user.username || undefined,
      createdAt: user.createdAt,
      lastReceiveMessageAt: user.lastReceiveMessageAt || undefined,
      subscriptionActive: !!user.subscriptionActive,
      subscriptionExpires: user.subscriptionExpires || undefined,
      subscriptionTier: user.subscriptionTier || 'free',
      isAdmin: !!user.isAdmin,
      trialUsed: !!user.trialUsed
    };
  }

  public async setAttribute(userId: number, key: string, value: any, returnResult: boolean = false): Promise<IUser | void> {
    const userExists = await this.exists(userId, false);
    if (!userExists) {
      console.log(`User ${userId} does not exist, cannot set attribute ${key}`);
      return;
    }
    
    const database = await this.db.connect();
    await database.run(
      `UPDATE users SET ${key} = ? WHERE userId = ?`,
      [value, userId]
    );

    if (returnResult) {
      return await this.getUserById(userId);
    }
  }

  public async checkSubscription(userId: number): Promise<boolean> {
    try {
      // Админы всегда имеют доступ
      if (await this.isAdmin(userId)) {
        return true;
      }

      const user = await this.getUserById(userId);
      
      if (!user.subscriptionActive) {
        return false;
      }

      // Проверяем срок действия подписки
      if (user.subscriptionExpires && user.subscriptionExpires < Date.now()) {
        // Подписка истекла
        await this.setAttribute(userId, 'subscriptionActive', 0);
        await this.setAttribute(userId, 'subscriptionTier', 'free');
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error checking subscription for user ${userId}:`, error);
      return false;
    }
  }

  public async activateSubscription(userId: number, days: number, tier: string): Promise<void> {
    let expiresAt: number;
    
    if (days === -1) {
      // Вечная подписка (100 лет)
      expiresAt = Date.now() + (36500 * 24 * 60 * 60 * 1000);
    } else {
      expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    }
    
    await this.setAttribute(userId, 'subscriptionActive', 1);
    await this.setAttribute(userId, 'subscriptionExpires', expiresAt);
    await this.setAttribute(userId, 'subscriptionTier', tier);
    
    console.log(`Subscription activated for user ${userId}, tier: ${tier}, expires: ${new Date(expiresAt)}`);
  }

  public async activateTrial(userId: number): Promise<boolean> {
  try {
    // Проверяем, использовал ли пользователь уже пробный период
    const user = await this.getUserById(userId);
    
    if (user.trialUsed) {
      return false; // Пробный период уже был использован
    }

    const currentTime = Date.now();
    let expiresAt: number;

    // Если уже есть активная подписка, добавляем 3 дня к ней
    if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires > currentTime) {
      expiresAt = user.subscriptionExpires + (3 * 24 * 60 * 60 * 1000);
    } else {
      // Создаем новую пробную подписку на 3 дня
      expiresAt = currentTime + (3 * 24 * 60 * 60 * 1000);
    }
    
    await this.setAttribute(userId, 'subscriptionActive', 1);
    await this.setAttribute(userId, 'subscriptionExpires', expiresAt);
    await this.setAttribute(userId, 'subscriptionTier', 'trial');
    await this.setAttribute(userId, 'trialUsed', 1);
    
    console.log(`Trial activated for user ${userId}, expires: ${new Date(expiresAt)}`);
    return true;
  } catch (error) {
    console.error(`Error activating trial for user ${userId}:`, error);
    return false;
  }
}

  public async hasUsedTrial(userId: number): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      return user.trialUsed;
    } catch (error) {
      return false;
    }
  }

  public async getAllUsers(): Promise<IUser[]> {
    const database = await this.db.connect();
    const users = await database.all('SELECT * FROM users ORDER BY createdAt DESC');
    
    return users.map((user: any) => ({
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName || undefined,
      username: user.username || undefined,
      createdAt: user.createdAt,
      lastReceiveMessageAt: user.lastReceiveMessageAt || undefined,
      subscriptionActive: !!user.subscriptionActive,
      subscriptionExpires: user.subscriptionExpires || undefined,
      subscriptionTier: user.subscriptionTier || 'free',
      isAdmin: !!user.isAdmin,
      trialUsed: !!user.trialUsed
    }));
  }

  public async getAllAdmins(): Promise<IUser[]> {
    const database = await this.db.connect();
    const admins = await database.all('SELECT * FROM users WHERE isAdmin = 1 ORDER BY createdAt DESC');
    
    return admins.map((user: any) => ({
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName || undefined,
      username: user.username || undefined,
      createdAt: user.createdAt,
      lastReceiveMessageAt: user.lastReceiveMessageAt || undefined,
      subscriptionActive: !!user.subscriptionActive,
      subscriptionExpires: user.subscriptionExpires || undefined,
      subscriptionTier: user.subscriptionTier || 'free',
      isAdmin: !!user.isAdmin,
      trialUsed: !!user.trialUsed
    }));
  }

  public async makeAdmin(userId: number): Promise<void> {
    // Главного администратора нельзя изменить
    if (userId === MAIN_ADMIN_ID) {
      throw new Error("Cannot modify main administrator");
    }
    
    const userExists = await this.exists(userId, true);
    await this.setAttribute(userId, 'isAdmin', 1);
    console.log(`User ${userId} promoted to admin`);
  }

  public async removeAdmin(userId: number): Promise<void> {
    // Главного администратора нельзя удалить
    if (userId === MAIN_ADMIN_ID) {
      throw new Error("Cannot remove main administrator");
    }
    
    const userExists = await this.exists(userId, true);
    await this.setAttribute(userId, 'isAdmin', 0);
    console.log(`User ${userId} demoted from admin`);
  }

  public async isAdmin(userId: number): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      return user.isAdmin;
    } catch (error) {
      return false;
    }
  }
}

class MessagesRepository implements IMessagesRepository {
  private db: SQLiteDatabase = new SQLiteDatabase();

  public async create(newMessageData: CreateMessageDto): Promise<IMessage> {
    const database = await this.db.connect();
    
    const newMessage: IMessage = {
      ...newMessageData,
      isEdited: false,
      isDeleted: false,
      hasMedia: !!newMessageData.media,
      sentAt: Date.now(),
      editedMessages: [],
      notificationMessageId: undefined
    };

    await database.run(
      `INSERT INTO messages 
       (messageId, text, media, userId, senderId, senderName, senderUsername, hasMedia, sentAt, editedMessages, notificationMessageId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newMessageData.messageId,
        newMessageData.text,
        newMessageData.media || null,
        newMessageData.userId,
        newMessageData.senderId,
        newMessageData.senderName,
        newMessageData.senderUsername || null,
        newMessage.hasMedia ? 1 : 0,
        newMessage.sentAt,
        JSON.stringify(newMessage.editedMessages),
        null
      ]
    );

    return newMessage;
  }

  public async getById(messageId: number, throwError: boolean = false): Promise<IMessage | null> {
    const database = await this.db.connect();
    const message = await database.get(
      'SELECT * FROM messages WHERE messageId = ?', 
      messageId
    );

    if (!message) {
      if (throwError) {
        throw new Error(`Message with id ${messageId} does not exist`);
      }
      return null;
    }

    return {
      messageId: message.messageId,
      text: message.text,
      media: message.media || undefined,
      userId: message.userId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderUsername: message.senderUsername || undefined,
      isEdited: !!message.isEdited,
      isDeleted: !!message.isDeleted,
      hasMedia: !!message.hasMedia,
      editedAt: message.editedAt || undefined,
      deletedAt: message.deletedAt || undefined,
      sentAt: message.sentAt,
      editedMessages: JSON.parse(message.editedMessages || '[]'),
      notificationMessageId: message.notificationMessageId || undefined
    };
  }

  public async exists(messageId: number, throwError: boolean = false): Promise<boolean> {
    const database = await this.db.connect();
    const message = await database.get(
      'SELECT messageId FROM messages WHERE messageId = ?', 
      messageId
    );

    if (message) {
      return true;
    } else {
      if (throwError) {
        throw new Error(`Message with id ${messageId} does not exist`);
      }
      return false;
    }
  }

  public async setAttribute(messageId: number, key: string, value: any, returnResult: boolean = false): Promise<IMessage | void | null> {
    const messageExists = await this.exists(messageId, false);
    if (!messageExists) {
      console.log(`Message ${messageId} does not exist, cannot set attribute ${key}`);
      return null;
    }
    
    const database = await this.db.connect();
    
    // Проверяем существование столбца перед обновлением
    try {
      await database.run(
        `UPDATE messages SET ${key} = ? WHERE messageId = ?`,
        [value, messageId]
      );
    } catch (error: any) {
      if (error.message.includes("no such column")) {
        console.log(`Column ${key} does not exist in messages table`);
        return null;
      }
      throw error;
    }

    if (returnResult) {
      return await this.getById(messageId);
    }
  }

  public async messageEdited(messageId: number, oldMessageText: string, newMessageText: string): Promise<void> {
    const database = await this.db.connect();
    
    // Get current message to update editedMessages array
    const currentMessage = await this.getById(messageId);
    if (!currentMessage) return;

    const updatedEditedMessages = [
      ...currentMessage.editedMessages,
      { oldMessageText, editedAt: Date.now() }
    ];

    await database.run(
      `UPDATE messages 
       SET text = ?, isEdited = 1, editedAt = ?, editedMessages = ? 
       WHERE messageId = ?`,
      [newMessageText, Date.now(), JSON.stringify(updatedEditedMessages), messageId]
    );
  }
}

// Market API Client
class MarketApiClient {
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

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.toLocaleString("default", { year: "numeric" });
  const month = date.toLocaleString("default", { month: "2-digit" });
  const day = date.toLocaleString("default", { day: "2-digit" });
  const hour = date.toLocaleString("default", { hour: "2-digit" });
  const minutes = date.toLocaleString("default", { minute: "2-digit" });
  const seconds = date.toLocaleString("default", { second: "2-digit" });

  return `${day}.${month}.${year} ${hour}:${minutes}:${seconds}`;
}

// Admin Service
class AdminService {
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
      
      await ctx.reply(
        dedent`
          ✅ <b>Подписка выдана успешно!</b>
          
          👤 Пользователь: ${user.firstName} (ID: ${user.userId})
          📅 Дней: ${days}
          🗓️ Действует до: ${expiresDate.toLocaleDateString('ru-RU')}
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
        await ctx.reply("❌ Нельзя изменить статус главного администратора.");
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
        `✅ Пользователь ${user.firstName} (ID: ${user.userId}) больше не администратор.`,
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
class SubscriptionService {
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
    const price = 49; // 49 Stars

    await ctx.api.sendInvoice(
      ctx.chat!.id,
      title,
      description,
      payload,
      "XTR", // Telegram Stars currency
      [
        {
          label: title,
          amount: price, // Amount in Stars (1 Star = 1 unit)
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

  async activateSubscription(userId: number): Promise<void> {
    const days = 30;
    const tier = "monthly";

    await this.usersCollection.activateSubscription(userId, days, tier);
  }
}

// Command handlers
async function getUserId(ctx: Context) {
  try {
    await ctx.editMessageText(
      `User ID: <code>${ctx.businessMessage?.chat.id}</code>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in getUserId:", error);
  }
}

async function listedGiftsHandler(ctx: Context, chatId: number) {
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

async function userCommandsHandler(ctx: Context, next: () => void) {
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
interface IUpdateHandler {
  updateName: FilterQuery | FilterQuery[];
  middlewares?: Array<Middleware<Context>>;
  run: (ctx: Context) => Promise<void> | void;
}

class BusinessConnectionHandler implements IUpdateHandler {
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

class BusinessImageMessageHandler implements IUpdateHandler {
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

class BusinessMessageHandler implements IUpdateHandler {
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

class DeletedBusinessMessageHandler implements IUpdateHandler {
  private messagesCollection = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  public updateName: FilterQuery = "deleted_business_messages";

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
}

class EditedBusinessMessageHandler implements IUpdateHandler {
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

// Обработчик callback-запросов для кнопок
async function handleCallbackQuery(ctx: Context) {
  if (!ctx.callbackQuery?.data) return;

  const data = ctx.callbackQuery.data;
  
  try {
    // Обработка основных кнопок
    if (data === 'main_menu') {
      await showMainMenu(ctx);
      await ctx.answerCallbackQuery();
      return;
    } else if (data === 'my_subscription') {
      await showMySubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    } else if (data === 'buy_subscription') {
      await buySubscription(ctx);
      await ctx.answerCallbackQuery();
      return;
    } else if (data === 'activate_trial') {
      await activateTrial(ctx);
      await ctx.answerCallbackQuery();
      return;
    } else if (data === 'help') {
      await showHelp(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    // Обработка админских callback-ов
    if (data.startsWith('admin_')) {
      const adminService = new AdminService();
      
      // Проверяем, что пользователь админ
      if (!await adminService.isAdmin(ctx.from!.id)) {
        await ctx.answerCallbackQuery("❌ Нет доступа");
        return;
      }
      
      if (data === 'admin_panel') {
        await adminService.showAdminPanel(ctx);
      } else if (data === 'admin_users') {
        await adminService.showUsersList(ctx);
      } else if (data === 'admin_admins') {
        await adminService.showAdminsList(ctx);
      } else if (data === 'admin_stats') {
        await adminService.showAdminPanel(ctx);
      } else if (data === 'admin_give_sub_menu') {
        await adminService.showGiveSubscriptionMenu(ctx);
      } else if (data === 'admin_remove_sub_menu') {
        await adminService.showRemoveSubscriptionMenu(ctx);
      } else if (data === 'admin_user_info_menu') {
        await adminService.showUserInfoMenu(ctx);
      } else if (data === 'admin_manage_admins') {
        await adminService.showManageAdminsMenu(ctx);
      } else if (data === 'admin_make_admin_menu') {
        await adminService.showMakeAdminMenu(ctx);
      } else if (data === 'admin_remove_admin_menu') {
        await adminService.showRemoveAdminMenu(ctx);
      } else if (data.startsWith('admin_give_')) {
        const parts = data.split('_');
        const days = parseInt(parts[2]);
        const userId = parseInt(parts[3]);
        await adminService.giveSubscription(ctx, userId, days);
      } else if (data.startsWith('admin_remove_')) {
        const parts = data.split('_');
        const userId = parseInt(parts[2]);
        if (parts.length === 3) {
          // admin_remove_123 - удаление подписки
          await adminService.removeSubscription(ctx, userId);
        } else if (parts.length === 4 && parts[1] === 'remove' && parts[2] === 'admin') {
          // admin_remove_admin_123 - удаление админа
          const userId = parseInt(parts[3]);
          await adminService.removeAdmin(ctx, userId);
        }
      } else if (data.startsWith('admin_make_admin_')) {
        const userId = parseInt(data.split('_')[3]);
        await adminService.makeAdmin(ctx, userId);
      } else if (data.startsWith('admin_user_')) {
        const userId = parseInt(data.split('_')[2]);
        await adminService.showUserInfo(ctx, userId);
      }
      
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Error in callback handler:", error);
    await ctx.answerCallbackQuery("Произошла ошибка");
  }
}

// Функции для обработки основных кнопок
async function showMainMenu(ctx: Context) {
  const usersCollection = new UserRepository();
  const adminService = new AdminService();
  
  if (!ctx.from) return;

  const hasActiveSubscription = await usersCollection.checkSubscription(ctx.from.id);
  const isAdmin = await adminService.isAdmin(ctx.from.id);
  const hasUsedTrial = await usersCollection.hasUsedTrial(ctx.from.id);

  let message = '';
  if (hasActiveSubscription) {
    message = dedent`
      🏠 <b>Главное меню</b>
      
      ✅ <b>Ваша подписка активна!</b>
      
      Вы можете использовать все функции бота.
    `;
  } else {
    message = dedent`
      🏠 <b>Главное меню</b>
      
      ❌ <b>Требуется подписка</b>
      
      Для использования бота необходимо приобрести подписку.
    `;
  }

  const keyboard = [];
  
  if (isAdmin) {
    keyboard.push([{ text: "👑 Админ-панель", callback_data: "admin_panel" }]);
  }
  
  keyboard.push([{ text: "💎 Моя подписка", callback_data: "my_subscription" }]);
  
  // Показываем кнопку пробного периода только не-админам, которые ещё не использовали его
  if (!isAdmin && !hasUsedTrial) {
    keyboard.push([{ text: "🎁 Активировать пробный период (3 дня)", callback_data: "activate_trial" }]);
  }
  
  keyboard.push(
    [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
    [{ text: "❓ Помощь", callback_data: "help" }]
  );

  try {
    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    await ctx.reply(message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

async function showMySubscription(ctx: Context) {
  const usersCollection = new UserRepository();
  
  if (!ctx.from) return;

  try {
    const user = await usersCollection.getUserById(ctx.from.id);
    const hasActiveSubscription = await usersCollection.checkSubscription(ctx.from.id);

    if (hasActiveSubscription && user.subscriptionExpires) {
      const expiresDate = new Date(user.subscriptionExpires);
      const daysLeft = Math.ceil((user.subscriptionExpires - Date.now()) / (1000 * 60 * 60 * 24));
      
      let subscriptionType = "Ежемесячный";
      if (user.subscriptionTier === "admin_forever") {
        subscriptionType = "👑 Вечная (Админ)";
      } else if (user.subscriptionTier === "admin") {
        subscriptionType = "⚡ Выданная админом";
      } else if (user.subscriptionTier === "trial") {
        subscriptionType = "🎁 Пробный период";
      }
      
      await ctx.editMessageText(
        dedent`
          ✅ <b>Ваша подписка активна</b>
          
          💎 Тариф: ${subscriptionType}
          📅 Действует до: ${expiresDate.toLocaleDateString('ru-RU')}
          ⏳ Осталось дней: ${daysLeft}
          
          Спасибо за использование нашего бота! 🚀
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Продлить подписку", callback_data: "buy_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    } else {
      await ctx.editMessageText(
        dedent`
          ❌ <b>Подписка не активна</b>
          
          Для использования бота необходимо приобрести подписку.
          
          💰 Стоимость: 49 Stars (≈ 1$)
          ⏰ Срок: 30 дней
          
          После покупки подписки вы получите полный доступ к функциям бота.
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error("Error in showMySubscription:", error);
    await ctx.reply("Произошла ошибка при получении информации о подписке.");
  }
}

async function activateTrial(ctx: Context) {
  const usersCollection = new UserRepository();
  const adminService = new AdminService();
  
  if (!ctx.from) return;

  try {
    // Проверяем, что пользователь не админ
    const isAdmin = await adminService.isAdmin(ctx.from.id);
    if (isAdmin) {
      await ctx.editMessageText(
        "❌ Администраторам не нужен пробный период, у вас уже есть полный доступ.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
      return;
    }

    // Пытаемся активировать пробный период
    const success = await usersCollection.activateTrial(ctx.from.id);
    
    if (success) {
      await ctx.editMessageText(
        dedent`
          🎉 <b>Пробный период активирован!</b>
          
          ✅ Вам предоставлен доступ на 3 дня
          
          Теперь вы можете использовать все функции бота бесплатно в течение 3 дней.
          
          Для настройки:
          1. Откройте настройки Telegram
          2. Перейдите в <i>Telegram Business -> Чат-боты</i>
          3. Назначьте меня как чат-бота
          
          Приятного использования! 🚀
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    } else {
      await ctx.editMessageText(
        dedent`
          ❌ <b>Пробный период уже использован</b>
          
          Вы уже активировали пробный период ранее.
          Каждый пользователь может использовать его только один раз.
          
          Для продолжения использования бота приобретите подписку.
        `,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error("Error in activateTrial:", error);
    await ctx.reply("Произошла ошибка при активации пробного периода.");
  }
}

async function buySubscription(ctx: Context) {
  const subscriptionService = new SubscriptionService();
  
  try {
    await ctx.editMessageText(
      dedent`
        💎 <b>Ежемесячная подписка</b>
        
        💰 Стоимость: 49 Stars (≈ 1$)
        ⏰ Срок: 30 дней
        
        <b>Что вы получите:</b>
        • Уведомления об удаленных сообщениях
        • Уведомления об отредактированных сообщениях
        • Мониторинг всех входящих сообщений
        
        Нажмите кнопку ниже для оплаты.
      `,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Оплатить 49 ⭐", callback_data: "pay_subscription" }],
            [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Error in buySubscription:", error);
  }
}

async function showHelp(ctx: Context) {
  const adminService = new AdminService();
  const isAdmin = ctx.from ? await adminService.isAdmin(ctx.from.id) : false;

  let helpText = dedent`
    ❓ <b>Помощь</b>

    <b>Доступные команды в личных чатах:</b>
    <i><code>.listed_gifts</code></i> – Список всех подарков пользователя на Tonnel Marketplace.
    <i><code>.id</code></i> – Получить ID пользователя.

    <b>Как настроить бота:</b>
    1. Откройте настройки Telegram
    2. Перейдите в <i>Telegram Business -> Чат-боты</i>
    3. Назначьте меня как чат-бота

    <b>Функции бота:</b>
    • Уведомления об удаленных сообщениях
    • Уведомления об edited сообщениях
    • Мониторинг всех входящих сообщений
  `;

  if (isAdmin) {
    helpText += '\n\n👑 <b>У вас есть доступ к админ-панели</b>';
  }

  const keyboard = [
    [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
    [{ text: "🛒 Купить подписку", callback_data: "buy_subscription" }],
    [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
  ];

  if (isAdmin) {
    keyboard.unshift([{ text: "👑 Админ-панель", callback_data: "admin_panel" }]);
  }

  try {
    await ctx.editMessageText(helpText, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    await ctx.reply(helpText, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

const updateHandlers: IUpdateHandler[] = [
  new BusinessMessageHandler(),
  new EditedBusinessMessageHandler(),
  new DeletedBusinessMessageHandler(),
  new BusinessConnectionHandler(),
  new BusinessImageMessageHandler()
];

// Main Bot Class
class BotInstance {
  private bot: Bot;
  private usersCollection: IUserRepository;
  private subscriptionService = new SubscriptionService();
  private adminService = new AdminService();

  constructor() {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new Error("BOT_TOKEN environment variable is not defined");
    }
    this.bot = new Bot(botToken);
    this.usersCollection = new UserRepository();
  }

  public async run() {
    try {
      this.registerHandlers();
      await this.bot.start({
        onStart: () => console.log("Bot started successfully!")
      });
    } catch (error) {
      console.error("Failed to start bot:", error);
      process.exit(1);
    }
  }

  private registerHandlers() {
    // Оставляем только команду start
    this.bot.command("start", (ctx: Context) => this.startCommandHandler(ctx));
    
    // Обработчик callback-запросов для кнопок
    this.bot.on("callback_query:data", handleCallbackQuery);

    // Обработчики платежей
    this.bot.on("pre_checkout_query", (ctx) => this.handlePreCheckoutQuery(ctx));
    this.bot.on("message:successful_payment", (ctx) => this.handleSuccessfulPayment(ctx));
    
    // Обработчик обычных текстовых сообщений для админских функций
    this.bot.on("message:text", (ctx) => this.handleAdminTextCommands(ctx));
    
    updateHandlers.forEach(handler => {
      const middlewares = handler.middlewares ?? [];
      this.bot.on(handler.updateName, ...middlewares, async (ctx: Context) => {
        try {
          await handler.run(ctx);
        } catch (error) {
          console.error(`Error in handler ${handler.constructor.name}:`, error);
        }
      });
    });

    // Error handler
    this.bot.catch((error) => {
      console.error("Bot error:", error);
    });
  }

  private async startCommandHandler(ctx: Context) {
    try {
      if (ctx.from) {
        const botMe = await ctx.api.getMe();
        const userId = ctx.from.id;
        
        // Проверяем, существует ли пользователь
        const userExists = await this.usersCollection.exists(userId);

        await this.usersCollection.create({
          userId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name || "",
          username: ctx.from.username || "",
        });

        // Активируем вечную подписку только для админа
        if (await this.adminService.isAdmin(ctx.from.id)) {
          await this.usersCollection.activateSubscription(ctx.from.id, -1, "admin_forever");
        }

        await showMainMenu(ctx);
      }
    } catch (error: any) {
      console.error("Error in startCommandHandler:", error);
      await ctx.reply("Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.");
    }
  }

  private async handlePreCheckoutQuery(ctx: Context) {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      console.error("Error in pre-checkout query:", error);
      await ctx.answerPreCheckoutQuery(false, "Произошла ошибка при обработке платежа");
    }
  }

  private async handleSuccessfulPayment(ctx: Context) {
    try {
      if (!ctx.from || !ctx.message?.successful_payment) return;

      await this.subscriptionService.activateSubscription(ctx.from.id);

      await ctx.reply(
        dedent`
          ✅ <b>Подписка успешно активирована!</b>
          
          Спасибо за покупку! Теперь вы можете использовать все функции бота.
          
          Для настройки:
          1. Откройте настройки Telegram
          2. Перейдите в <i>Telegram Business -> Чат-боты</i>
          3. Назначьте меня как чат-бота
          
          Используйте кнопку "Моя подписка" чтобы посмотреть статус подписки.
        `,
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💎 Моя подписка", callback_data: "my_subscription" }],
              [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );

    } catch (error) {
      console.error("Error handling successful payment:", error);
      await ctx.reply("Произошла ошибка при активации подписки. Пожалуйста, свяжитесь с поддержкой.");
    }
  }

  private async handleAdminTextCommands(ctx: Context) {
    try {
      if (!ctx.from || !ctx.message?.text) return;

      // Проверяем, является ли пользователь админом
      const isAdmin = await this.adminService.isAdmin(ctx.from.id);
      if (!isAdmin) return;

      const text = ctx.message.text.trim();
      
      // Обработка выдачи подписки (формат: "123456789 30" или "123456789 -1")
      const subMatch = text.match(/^(\d+)\s+(-?\d+)$/);
      if (subMatch) {
        const targetUserId = parseInt(subMatch[1]);
        const days = parseInt(subMatch[2]);
        
        await this.adminService.giveSubscription(ctx, targetUserId, days);
        return;
      }

      // Обработка удаления подписки (формат: "123456789")
      const userIdMatch = text.match(/^(\d+)$/);
      if (userIdMatch) {
        const targetUserId = parseInt(userIdMatch[1]);
        
        // Проверяем, существует ли пользователь
        try {
          const user = await this.usersCollection.getUserById(targetUserId);
          
          // Показываем информацию о пользователе
          await this.adminService.showUserInfo(ctx, targetUserId);
        } catch (error) {
          await ctx.reply("❌ Пользователь с таким ID не найден.");
        }
        return;
      }

    } catch (error) {
      console.error("Error in handleAdminTextCommands:", error);
    }
  }
}

// Main execution
(async () => {
  try {
    console.log("Starting bot...");
    const bot = new BotInstance();
    await bot.run();
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
})();