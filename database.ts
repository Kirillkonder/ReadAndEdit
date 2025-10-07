// database.ts - База данных и репозитории
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Admin ID - главный администратор (нельзя удалить)
export const MAIN_ADMIN_ID = 842428912;

// SQLite Database setup
export class SQLiteDatabase {
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
    trialUsed INTEGER DEFAULT 0,
    giftBoomBonusUsed INTEGER DEFAULT 0,
    referredBy INTEGER,
    referralCount INTEGER DEFAULT 0,
    referralLink TEXT
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

    // Добавляем столбец giftBoomBonusUsed если его нет
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN giftBoomBonusUsed INTEGER DEFAULT 0");
      console.log("Column giftBoomBonusUsed added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column giftBoomBonusUsed already exists");
      }
    }
  }
}

// Database types and interfaces
export interface IUser {
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
  giftBoomBonusUsed: boolean;
  
  // ДОБАВЬ ЭТИ ПОЛЯ ДЛЯ РЕФЕРАЛЬНОЙ СИСТЕМЫ:
  referredBy?: number;
  referralCount: number;
  referralLink?: string;
}
export interface CreateUserDto {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

export interface IUserRepository {
  create(userData: CreateUserDto): Promise<void>;
  exists(userId: number, throwError?: boolean): Promise<boolean>;
  getUserById(userId: number): Promise<IUser>;
  setAttribute(userId: number, key: string, value: any, returnResult?: boolean): Promise<IUser | void>;
  createOrUpdate(userData: CreateUserDto): Promise<void>;
  checkSubscription(userId: number): Promise<boolean>;
  activateSubscription(userId: number, days: number, tier: string): Promise<void>;
  getAllUsers(): Promise<IUser[]>;
  getAllAdmins(): Promise<IUser[]>;
  makeAdmin(userId: number): Promise<void>;
  removeAdmin(userId: number): Promise<void>;
  isAdmin(userId: number): Promise<boolean>;
  hasUsedGiftBoomBonus(userId: number): Promise<boolean>;
  markGiftBoomBonusUsed(userId: number): Promise<void>;
  
  // ДОБАВЬ ЭТИ МЕТОДЫ ДЛЯ РЕФЕРАЛЬНОЙ СИСТЕМЫ:
  setReferredBy(userId: number, referrerId: number): Promise<void>;
  incrementReferralCount(userId: number): Promise<void>;
  setReferralLink(userId: number, link: string): Promise<void>;
  getUserByReferralLink(link: string): Promise<IUser | null>;
}
export interface IMessage {
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

export interface CreateMessageDto {
  messageId: number;
  text: string;
  media?: string;
  userId: number;
  senderId: number;
  senderName: string;
  senderUsername?: string;
}

export interface IMessagesRepository {
  create(message: CreateMessageDto): Promise<IMessage>;
  getById(messageId: number, throwError?: boolean): Promise<IMessage | null>;
  setAttribute(messageId: number, key: string, value: any, returnResult?: boolean): Promise<IMessage | void | null>;
  exists(messageId: number, throwError?: boolean): Promise<boolean>;
  messageEdited(messageId: number, oldMessageText: string, newMessageText: string): Promise<void>;
}

export class UserRepository implements IUserRepository {
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
      `INSERT INTO users (userId, firstName, lastName, username, createdAt, subscriptionActive, subscriptionTier, isAdmin, trialUsed, giftBoomBonusUsed, referralCount) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userData.userId, userData.firstName, userData.lastName || null, userData.username || null, Date.now(), 0, 'free', isAdmin, 0, 0, 0]
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
    trialUsed: !!user.trialUsed,
    giftBoomBonusUsed: !!user.giftBoomBonusUsed,
    // ДОБАВЬ ЭТИ ПОЛЯ:
    referredBy: user.referredBy || undefined,
    referralCount: user.referralCount || 0,
    referralLink: user.referralLink || undefined
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
  try {
    const user = await this.getUserById(userId);
    const currentTime = Date.now();
    
    let expiresAt: number;

    if (days === -1) {
      // Вечная подписка (100 лет)
      expiresAt = Date.now() + (36500 * 24 * 60 * 60 * 1000);
    } else if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires > currentTime) {
      // Добавляем дни к существующей подписке
      expiresAt = user.subscriptionExpires + (days * 24 * 60 * 60 * 1000);
    } else {
      // Создаем новую подписку
      expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    }
    
    await this.setAttribute(userId, 'subscriptionActive', 1);
    await this.setAttribute(userId, 'subscriptionExpires', expiresAt);
    await this.setAttribute(userId, 'subscriptionTier', tier);
    
    console.log(`Subscription activated for user ${userId}, tier: ${tier}, expires: ${new Date(expiresAt)}`);
  } catch (error) {
    console.error(`Error activating subscription for user ${userId}:`, error);
    throw error;
  }
}

  public async hasUsedGiftBoomBonus(userId: number): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      return user.giftBoomBonusUsed;
    } catch (error) {
      return false;
    }
  }

  public async markGiftBoomBonusUsed(userId: number): Promise<void> {
    await this.setAttribute(userId, 'giftBoomBonusUsed', 1);
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
    trialUsed: !!user.trialUsed,
    giftBoomBonusUsed: !!user.giftBoomBonusUsed,
    // ДОБАВЬ ЭТИ ПОЛЯ:
    referredBy: user.referredBy || undefined,
    referralCount: user.referralCount || 0,
    referralLink: user.referralLink || undefined
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
    trialUsed: !!user.trialUsed,
    giftBoomBonusUsed: !!user.giftBoomBonusUsed,
    // ДОБАВЬ ЭТИ ПОЛЯ:
    referredBy: user.referredBy || undefined,
    referralCount: user.referralCount || 0,
    referralLink: user.referralLink || undefined
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

   public async getUserByReferralLink(link: string): Promise<IUser | null> {
    const database = await this.db.connect();
    const user = await database.get('SELECT * FROM users WHERE referralLink = ?', link);
    return user ? this.mapUser(user) : null;
  }

  public async incrementReferralCount(userId: number): Promise<void> {
    const database = await this.db.connect();
    await database.run(
      'UPDATE users SET referralCount = referralCount + 1 WHERE userId = ?',
      [userId]
    );
  }

  public async setReferralLink(userId: number, link: string): Promise<void> {
    await this.setAttribute(userId, 'referralLink', link);
  }

  public async setReferredBy(userId: number, referrerId: number): Promise<void> {
    await this.setAttribute(userId, 'referredBy', referrerId);
  }

  private mapUser(user: any): IUser {
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
      trialUsed: !!user.trialUsed,
      giftBoomBonusUsed: !!user.giftBoomBonusUsed,
      referredBy: user.referredBy || undefined,
      referralCount: user.referralCount || 0,
      referralLink: user.referralLink || undefined
    };
  }

}

export class MessagesRepository implements IMessagesRepository {
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