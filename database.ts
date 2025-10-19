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
        voice TEXT,
        video TEXT,
        videoFile TEXT,
        userId INTEGER NOT NULL,
        senderId INTEGER NOT NULL,
        senderName TEXT NOT NULL,
        senderUsername TEXT,
        isEdited INTEGER DEFAULT 0,
        isDeleted INTEGER DEFAULT 0,
        hasMedia INTEGER DEFAULT 0,
        hasVoice INTEGER DEFAULT 0,
        hasVideo INTEGER DEFAULT 0,
        hasVideoFile INTEGER DEFAULT 0,
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

    // Добавляем столбцы для голосовых сообщений если их нет
    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN voice TEXT");
      console.log("Column voice added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column voice already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN hasVoice INTEGER DEFAULT 0");
      console.log("Column hasVoice added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column hasVoice already exists");
      }
    }

    // Добавляем столбцы для видеосообщений если их нет
    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN video TEXT");
      console.log("Column video added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column video already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN hasVideo INTEGER DEFAULT 0");
      console.log("Column hasVideo added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column hasVideo already exists");
      }
    }

    // ДОБАВЛЯЕМ СТОЛБЦЫ ДЛЯ ОБЫЧНЫХ ВИДЕОФАЙЛОВ
    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN videoFile TEXT");
      console.log("Column videoFile added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column videoFile already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE messages ADD COLUMN hasVideoFile INTEGER DEFAULT 0");
      console.log("Column hasVideoFile added to messages table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column hasVideoFile already exists");
      }
    }

    // НОВЫЕ СТОЛБЦЫ ДЛЯ РЕФЕРАЛЬНОГО ЗАРАБОТКА
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN earnedStars INTEGER DEFAULT 0");
      console.log("Column earnedStars added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column earnedStars already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN pendingWithdrawal INTEGER DEFAULT 0");
      console.log("Column pendingWithdrawal added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column pendingWithdrawal already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN totalWithdrawn INTEGER DEFAULT 0");
      console.log("Column totalWithdrawn added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column totalWithdrawn already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN withdrawalRequests TEXT DEFAULT '[]'");
      console.log("Column withdrawalRequests added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column withdrawalRequests already exists");
      }
    }

    try {
      await this.db.run("ALTER TABLE users ADD COLUMN awaitingWithdrawalAmount INTEGER DEFAULT 0");
      console.log("Column awaitingWithdrawalAmount added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column awaitingWithdrawalAmount already exists");
      }
    }

    // НОВЫЙ СТОЛБЕЦ ДЛЯ РАССЫЛКИ СООБЩЕНИЙ
    try {
      await this.db.run("ALTER TABLE users ADD COLUMN awaitingBroadcastMessage INTEGER DEFAULT 0");
      console.log("Column awaitingBroadcastMessage added to users table");
    } catch (error: any) {
      if (!error.message.includes("duplicate column name")) {
        console.log("Column awaitingBroadcastMessage already exists");
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

  // НОВЫЕ ПОЛЯ ДЛЯ РЕФЕРАЛЬНОГО ЗАРАБОТКА
  earnedStars: number;
  pendingWithdrawal: number;
  totalWithdrawn: number;
  withdrawalRequests: string; // JSON массив заявок на вывод
  awaitingWithdrawalAmount?: number;
  awaitingBroadcastMessage?: number; // НОВОЕ ПОЛЕ ДЛЯ РАССЫЛКИ
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

  // НОВЫЕ МЕТОДЫ ДЛЯ РЕФЕРАЛЬНОГО ЗАРАБОТКА
  getUserAttribute(userId: number, key: string): Promise<any>;
}

export interface IMessage {
  messageId: number;
  text: string;
  media?: string;
  voice?: string;
  video?: string;
  videoFile?: string; // ДОБАВЛЯЕМ ПОЛЕ ДЛЯ ОБЫЧНЫХ ВИДЕО
  userId: number;
  senderId: number;
  senderName: string;
  senderUsername?: string;
  isEdited: boolean;
  isDeleted: boolean;
  hasMedia: boolean;
  hasVoice: boolean;
  hasVideo: boolean;
  hasVideoFile: boolean; // ДОБАВЛЯЕМ ФЛАГ ДЛЯ ОБЫЧНЫХ ВИДЕО
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
  voice?: string;
  video?: string;
  videoFile?: string; // ДОБАВЛЯЕМ ПОЛЕ ДЛЯ ОБЫЧНЫХ ВИДЕО
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
  
  // НОВЫЕ МЕТОДЫ ДЛЯ ЭКСПОРТА ПЕРЕПИСКИ
  getMessagesByUserAndSender(userId: number, senderId: number): Promise<IMessage[]>;
  getAllMessagesByUser(userId: number): Promise<IMessage[]>;
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
      `INSERT INTO users (userId, firstName, lastName, username, createdAt, subscriptionActive, subscriptionTier, isAdmin, trialUsed, giftBoomBonusUsed, referralCount, earnedStars, pendingWithdrawal, totalWithdrawn, withdrawalRequests, awaitingWithdrawalAmount, awaitingBroadcastMessage) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userData.userId, userData.firstName, userData.lastName || null, userData.username || null, Date.now(), 0, 'free', isAdmin, 0, 0, 0, 0, 0, 0, '[]', 0, 0]
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
    referralLink: user.referralLink || undefined,
    // НОВЫЕ ПОЛЯ ДЛЯ РЕФЕРАЛЬНОГО ЗАРАБОТКА
    earnedStars: user.earnedStars || 0,
    pendingWithdrawal: user.pendingWithdrawal || 0,
    totalWithdrawn: user.totalWithdrawn || 0,
    withdrawalRequests: user.withdrawalRequests || '[]',
    awaitingWithdrawalAmount: user.awaitingWithdrawalAmount || 0,
    awaitingBroadcastMessage: user.awaitingBroadcastMessage || 0
  };
}

 public async setAttribute(userId: number, key: string, value: any, returnResult: boolean = false): Promise<IUser | void> {
  try {
    const userExists = await this.exists(userId, false);
    if (!userExists) {
      console.log(`User ${userId} does not exist, cannot set attribute ${key}`);
      throw new Error(`User ${userId} does not exist`);
    }
    
    const database = await this.db.connect();
    await database.run(
      `UPDATE users SET ${key} = ? WHERE userId = ?`,
      [value, userId]
    );

    console.log(`Attribute ${key} set to ${value} for user ${userId}`);

    if (returnResult) {
      return await this.getUserById(userId);
    }
  } catch (error) {
    console.error(`Error setting attribute ${key} for user ${userId}:`, error);
    throw error;
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
      // Подписка истекла - ОБНОВЛЯЕМ СТАТУС В БАЗЕ
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

// НОВАЯ ФУНКЦИЯ для получения актуального статуса подписки (без изменения базы)
// НОВАЯ ФУНКЦИЯ для получения актуального статуса подписки (с проверкой срока)
public async getSubscriptionStatus(userId: number): Promise<boolean> {
  try {
    // Админы всегда имеют доступ
    if (await this.isAdmin(userId)) {
      return true;
    }

    const user = await this.getUserById(userId);
    
    // Если подписка не активна в базе
    if (!user.subscriptionActive) {
      return false;
    }

    // ВАЖНО: проверяем срок действия подписки
    if (user.subscriptionExpires && user.subscriptionExpires < Date.now()) {
      // Подписка истекла - возвращаем false
      return false;
    }

    // Если subscriptionExpires не установлен, считаем подписку неактивной
    if (!user.subscriptionExpires) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error getting subscription status for user ${userId}:`, error);
    return false;
  }
}

public async fixExpiredSubscriptions(): Promise<{ fixed: number, total: number }> {
  try {
    const database = await this.db.connect();
    const allUsers = await this.getAllUsers();
    let fixedCount = 0;

    const currentTime = Date.now();
    
    for (const user of allUsers) {
      // Если подписка активна в базе но истекла по времени - исправляем
      if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires < currentTime) {
        await this.setAttribute(user.userId, 'subscriptionActive', 0);
        await this.setAttribute(user.userId, 'subscriptionTier', 'free');
        fixedCount++;
        console.log(`Fixed subscription for user ${user.userId} - expired on ${new Date(user.subscriptionExpires).toLocaleString()}`);
      }
      
      // Если подписка активна но нет даты окончания - деактивируем
      if (user.subscriptionActive && !user.subscriptionExpires) {
        await this.setAttribute(user.userId, 'subscriptionActive', 0);
        await this.setAttribute(user.userId, 'subscriptionTier', 'free');
        fixedCount++;
        console.log(`Fixed subscription for user ${user.userId} - no expiration date`);
      }
    }

    console.log(`Subscription fix completed: ${fixedCount} users fixed out of ${allUsers.length}`);
    return { fixed: fixedCount, total: allUsers.length };
  } catch (error) {
    console.error("Error fixing subscription statuses:", error);
    return { fixed: 0, total: 0 };
  }
}

public async updateAllSubscriptionStatuses(): Promise<{ updated: number, total: number }> {
  try {
    const database = await this.db.connect();
    const allUsers = await this.getAllUsers();
    let updatedCount = 0;

    for (const user of allUsers) {
      const currentTime = Date.now();
      
      // Если подписка активна но истекла - обновляем статус
      if (user.subscriptionActive && user.subscriptionExpires && user.subscriptionExpires < currentTime) {
        await this.setAttribute(user.userId, 'subscriptionActive', 0);
        await this.setAttribute(user.userId, 'subscriptionTier', 'free');
        updatedCount++;
        console.log(`Updated subscription status for user ${user.userId}`);
      }
    }

    console.log(`Subscription status update completed: ${updatedCount} users updated out of ${allUsers.length}`);
    return { updated: updatedCount, total: allUsers.length };
  } catch (error) {
    console.error("Error updating subscription statuses:", error);
    return { updated: 0, total: 0 };
  }
}

 public async activateSubscription(userId: number, days: number, tier: string): Promise<void> {
  try {
    console.log(`Activating subscription for user ${userId}, days: ${days}, tier: ${tier}`);
    
    const userExists = await this.exists(userId);
    if (!userExists) {
      throw new Error(`User ${userId} not found`);
    }

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
    console.error(`Error in activateSubscription for user ${userId}:`, error);
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
  
  return users.map((user: any) => this.mapUser(user));
}

  public async getAllAdmins(): Promise<IUser[]> {
  const database = await this.db.connect();
  const admins = await database.all('SELECT * FROM users WHERE isAdmin = 1 ORDER BY createdAt DESC');
  
  return admins.map((user: any) => this.mapUser(user));
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

  public async getUserAttribute(userId: number, key: string): Promise<any> {
    try {
      const user = await this.getUserById(userId);
      return (user as any)[key];
    } catch (error) {
      return null;
    }
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
      referralLink: user.referralLink || undefined,
      // НОВЫЕ ПОЛЯ
      earnedStars: user.earnedStars || 0,
      pendingWithdrawal: user.pendingWithdrawal || 0,
      totalWithdrawn: user.totalWithdrawn || 0,
      withdrawalRequests: user.withdrawalRequests || '[]',
      awaitingWithdrawalAmount: user.awaitingWithdrawalAmount || 0,
      awaitingBroadcastMessage: user.awaitingBroadcastMessage || 0
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
      hasVoice: !!newMessageData.voice,
      hasVideo: !!newMessageData.video,
      hasVideoFile: !!newMessageData.videoFile, // ДОБАВЛЯЕМ ФЛАГ ДЛЯ ОБЫЧНЫХ ВИДЕО
      sentAt: Date.now(),
      editedMessages: [],
      notificationMessageId: undefined
    };

    await database.run(
      `INSERT INTO messages 
       (messageId, text, media, voice, video, videoFile, userId, senderId, senderName, senderUsername, hasMedia, hasVoice, hasVideo, hasVideoFile, sentAt, editedMessages, notificationMessageId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newMessageData.messageId,
        newMessageData.text,
        newMessageData.media || null,
        newMessageData.voice || null,
        newMessageData.video || null,
        newMessageData.videoFile || null, // ДОБАВЛЯЕМ ОБЫЧНОЕ ВИДЕО
        newMessageData.userId,
        newMessageData.senderId,
        newMessageData.senderName,
        newMessageData.senderUsername || null,
        newMessage.hasMedia ? 1 : 0,
        newMessage.hasVoice ? 1 : 0,
        newMessage.hasVideo ? 1 : 0,
        newMessage.hasVideoFile ? 1 : 0, // ДОБАВЛЯЕМ ФЛАГ ОБЫЧНОГО ВИДЕО
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
      voice: message.voice || undefined,
      video: message.video || undefined,
      videoFile: message.videoFile || undefined, // ДОБАВЛЯЕМ ОБЫЧНОЕ ВИДЕО
      userId: message.userId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderUsername: message.senderUsername || undefined,
      isEdited: !!message.isEdited,
      isDeleted: !!message.isDeleted,
      hasMedia: !!message.hasMedia,
      hasVoice: !!message.hasVoice,
      hasVideo: !!message.hasVideo,
      hasVideoFile: !!message.hasVideoFile, // ДОБАВЛЯЕМ ФЛАГ ОБЫЧНОГО ВИДЕО
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

  // НОВЫЕ МЕТОДЫ ДЛЯ ЭКСПОРТА ПЕРЕПИСКИ
  public async getMessagesByUserAndSender(userId: number, senderId: number): Promise<IMessage[]> {
    const database = await this.db.connect();
    const messages = await database.all(
      'SELECT * FROM messages WHERE userId = ? AND senderId = ? ORDER BY sentAt ASC',
      [userId, senderId]
    );
    
    return messages.map((message: any) => ({
      messageId: message.messageId,
      text: message.text,
      media: message.media || undefined,
      voice: message.voice || undefined,
      video: message.video || undefined,
      videoFile: message.videoFile || undefined,
      userId: message.userId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderUsername: message.senderUsername || undefined,
      isEdited: !!message.isEdited,
      isDeleted: !!message.isDeleted,
      hasMedia: !!message.hasMedia,
      hasVoice: !!message.hasVoice,
      hasVideo: !!message.hasVideo,
      hasVideoFile: !!message.hasVideoFile,
      editedAt: message.editedAt || undefined,
      deletedAt: message.deletedAt || undefined,
      sentAt: message.sentAt,
      editedMessages: JSON.parse(message.editedMessages || '[]'),
      notificationMessageId: message.notificationMessageId || undefined
    }));
  }

  public async getAllMessagesByUser(userId: number): Promise<IMessage[]> {
    const database = await this.db.connect();
    const messages = await database.all(
      'SELECT * FROM messages WHERE userId = ? ORDER BY sentAt ASC',
      [userId]
    );
    
    return messages.map((message: any) => ({
      messageId: message.messageId,
      text: message.text,
      media: message.media || undefined,
      voice: message.voice || undefined,
      video: message.video || undefined,
      videoFile: message.videoFile || undefined,
      userId: message.userId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderUsername: message.senderUsername || undefined,
      isEdited: !!message.isEdited,
      isDeleted: !!message.isDeleted,
      hasMedia: !!message.hasMedia,
      hasVoice: !!message.hasVoice,
      hasVideo: !!message.hasVideo,
      hasVideoFile: !!message.hasVideoFile,
      editedAt: message.editedAt || undefined,
      deletedAt: message.deletedAt || undefined,
      sentAt: message.sentAt,
      editedMessages: JSON.parse(message.editedMessages || '[]'),
      notificationMessageId: message.notificationMessageId || undefined
    }));
  }
}
