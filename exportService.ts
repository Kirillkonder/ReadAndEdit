// exportService.ts - Сервис для экспорта переписки
import { Context } from "grammy";
import { MessagesRepository } from "./database";
import { createReadStream, mkdirSync, writeFileSync, createWriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import archiver from "archiver";
import { InputFile } from "grammy";
import * as fs from "fs";
import { SubscriptionService } from "./services";

export class ExportService {
  private messagesCollection = new MessagesRepository();
  private subscriptionService = new SubscriptionService();

  async startExportProcess(ctx: Context) {
    if (!ctx.from) return;

    // ПРОВЕРЯЕМ ПОДПИСКУ
    const hasSubscription = await this.subscriptionService.checkAccess(ctx.from.id);
    if (!hasSubscription) {
      await ctx.reply(
        "❌ <b>Для экспорта переписки требуется активная подписка</b>\n\n" +
        "Приобретите подписку, чтобы получить доступ к этой функции.",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💎 Купить подписку", callback_data: "buy_subscription" }],
              [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
      return;
    }

    await ctx.reply(
      "💾 <b>Экспорт переписки</b>\n\n" +
      "Введите username пользователя, переписку с которым хотите сохранить:\n\n" +
      "<i>Пример: @username или просто username</i>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Отмена", callback_data: "main_menu" }]
          ]
        }
      }
    );
  }

  async exportChatHistory(ctx: Context, targetUsername: string) {
    if (!ctx.from) return;

    // ПРОВЕРЯЕМ ПОДПИСКУ ПЕРЕД ЭКСПОРТОМ
    const hasSubscription = await this.subscriptionService.checkAccess(ctx.from.id);
    if (!hasSubscription) {
      await ctx.reply(
        "❌ <b>Для экспорта переписки требуется активная подписка</b>\n\n" +
        "Приобретите подписку, чтобы получить доступ к этой функции.",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💎 Купить подписку", callback_data: "buy_subscription" }],
              [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
      return;
    }

    try {
      // Убираем @ если есть
      const cleanUsername = targetUsername.replace('@', '');
      
      await ctx.reply("🔄 Собираю историю переписки...");

      // Получаем все сообщения пользователя
      const allMessages = await this.messagesCollection.getAllMessagesByUser(ctx.from.id);
      
      // НАХОДИМ ID целевого пользователя по username
      let targetUserId: number | null = null;
      for (const msg of allMessages) {
        if (msg.senderUsername?.toLowerCase() === cleanUsername.toLowerCase()) {
          targetUserId = msg.senderId;
          break;
        }
      }

      if (!targetUserId) {
        await ctx.reply(
          "❌ Не найдено сообщений с указанным пользователем.",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Попробовать снова", callback_data: "export_chat" }],
                [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
              ]
            }
          }
        );
        return;
      }

      // ФИЛЬТРУЕМ СООБЩЕНИЯ МЕЖДУ ДВУМЯ ПОЛЬЗОВАТЕЛЯМИ
      const chatMessages = allMessages.filter(msg => 
        msg.senderId === ctx.from!.id || msg.senderId === targetUserId
      );

      if (chatMessages.length === 0) {
        await ctx.reply(
          "❌ Не найдено сообщений с указанным пользователем.",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Попробовать снова", callback_data: "export_chat" }],
                [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
              ]
            }
          }
        );
        return;
      }

      await ctx.reply("📦 Создаю архив с файлами...");

      // Создаем временную папку
      const tempDir = join(tmpdir(), `chat_export_${ctx.from.id}_${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      // Создаем папки для медиа
      const photosDir = join(tempDir, 'photos');
      const voiceDir = join(tempDir, 'voice_messages');
      const videoDir = join(tempDir, 'video_messages');
      const videoFilesDir = join(tempDir, 'video_files'); // ДОБАВЛЯЕМ ПАПКУ ДЛЯ ОБЫЧНЫХ ВИДЕО
      mkdirSync(photosDir, { recursive: true });
      mkdirSync(voiceDir, { recursive: true });
      mkdirSync(videoDir, { recursive: true });
      mkdirSync(videoFilesDir, { recursive: true }); // СОЗДАЕМ ПАПКУ ДЛЯ ОБЫЧНЫХ ВИДЕО

      // Создаем файл с текстовой историей
      const textContent = this.generateTextExport(chatMessages, targetUserId, ctx.from.first_name, cleanUsername);
      writeFileSync(join(tempDir, 'chat_history.txt'), textContent, 'utf-8');

      // Скачиваем фото, голосовые, видеосообщения и обычные видео
      let photoCount = 0;
      let voiceCount = 0;
      let videoCount = 0;
      let videoFileCount = 0; // ДОБАВЛЯЕМ СЧЕТЧИК ОБЫЧНЫХ ВИДЕО

      for (const message of chatMessages) {
        try {
          const isFromTargetUser = message.senderId === targetUserId;
          const senderName = isFromTargetUser ? cleanUsername : ctx.from!.first_name;
          
          // Скачиваем фото
          if (message.hasMedia && message.media) {
            try {
              const file = await ctx.api.getFile(message.media);
              const filePath = file.file_path;
              
              if (filePath) {
                const downloadUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
                const response = await fetch(downloadUrl);
                const buffer = await response.arrayBuffer();
                
                const extension = this.getFileExtension(filePath);
                const photoFilename = `${senderName}_${message.messageId}${extension}`;
                writeFileSync(join(photosDir, photoFilename), Buffer.from(buffer));
                photoCount++;
              }
            } catch (error) {
              console.error(`Error downloading photo ${message.messageId}:`, error);
            }
          }

          // Скачиваем голосовые сообщения
          if (message.hasVoice && message.voice) {
            try {
              const file = await ctx.api.getFile(message.voice);
              const filePath = file.file_path;
              
              if (filePath) {
                const downloadUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
                const response = await fetch(downloadUrl);
                const buffer = await response.arrayBuffer();
                
                const voiceFilename = `${senderName}_${message.messageId}.ogg`;
                writeFileSync(join(voiceDir, voiceFilename), Buffer.from(buffer));
                voiceCount++;
              }
            } catch (error) {
              console.error(`Error downloading voice ${message.messageId}:`, error);
            }
          }

          // Скачиваем видеосообщения (кружки)
          if (message.hasVideo && message.video) {
            try {
              const file = await ctx.api.getFile(message.video);
              const filePath = file.file_path;
              
              if (filePath) {
                const downloadUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
                const response = await fetch(downloadUrl);
                const buffer = await response.arrayBuffer();
                
                const videoFilename = `${senderName}_${message.messageId}.mp4`;
                writeFileSync(join(videoDir, videoFilename), Buffer.from(buffer));
                videoCount++;
              }
            } catch (error) {
              console.error(`Error downloading video ${message.messageId}:`, error);
            }
          }

          // Скачиваем обычные видео
          if (message.hasVideoFile && message.videoFile) {
            try {
              const file = await ctx.api.getFile(message.videoFile);
              const filePath = file.file_path;
              
              if (filePath) {
                const downloadUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
                const response = await fetch(downloadUrl);
                const buffer = await response.arrayBuffer();
                
                const videoFilename = `${senderName}_${message.messageId}.mp4`;
                writeFileSync(join(videoFilesDir, videoFilename), Buffer.from(buffer));
                videoFileCount++;
              }
            } catch (error) {
              console.error(`Error downloading video file ${message.messageId}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error processing message ${message.messageId}:`, error);
        }
      }

      // Создаем архив
      const archivePath = join(tempDir, 'chat_export.zip');
      const output = createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise<void>((resolve, reject) => {
        output.on('close', async () => {
          try {
            await ctx.reply("📤 Отправляю архив...");
            
            // Отправляем архив
            await ctx.replyWithDocument(
              new InputFile(createReadStream(archivePath), `chat_export_${cleanUsername}_${Date.now()}.zip`),
              {
                caption: `💾 Экспорт переписки с ${targetUsername}\n\n` +
                        `📅 Сообщений: ${chatMessages.length}\n` +
                        `📸 Фото: ${photoCount}\n` +
                        `🎤 Голосовых: ${voiceCount}\n` +
                        `🎥 Видеосообщений: ${videoCount}\n` +
                        `🎬 Обычных видео: ${videoFileCount}\n` + // ДОБАВЛЯЕМ ИНФО ОБ ОБЫЧНЫХ ВИДЕО
                        `📁 В архиве:\n` +
                        `   • chat_history.txt - вся переписка\n` +
                        `   • photos/ - все фотографии\n` +
                        `   • voice_messages/ - все голосовые\n` +
                        `   • video_messages/ - все видеосообщения\n` +
                        `   • video_files/ - все обычные видео\n\n` + // ДОБАВЛЯЕМ ПАПКУ ОБЫЧНЫХ ВИДЕО
                        `✅ <b>Функция доступна по подписке</b>`,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🏠 Главное меню", callback_data: "main_menu" }]
                  ]
                }
              }
            );

            // Удаляем временные файлы
            this.deleteFolderRecursive(tempDir);

            resolve();
          } catch (error) {
            // Удаляем временные файлы даже при ошибке
            this.deleteFolderRecursive(tempDir);
            reject(error);
          }
        });

        archive.on('error', (error) => {
          this.deleteFolderRecursive(tempDir);
          reject(error);
        });

        archive.pipe(output);

        // Добавляем текстовый файл в архив
        archive.file(join(tempDir, 'chat_history.txt'), { name: 'chat_history.txt' });

        // Добавляем папку с фото
        archive.directory(photosDir, 'photos');

        // Добавляем папку с голосовыми
        archive.directory(voiceDir, 'voice_messages');

        // Добавляем папку с видео-кружками
        archive.directory(videoDir, 'video_messages');

        // Добавляем папку с обычными видео
        archive.directory(videoFilesDir, 'video_files');

        archive.finalize();
      });

    } catch (error) {
      console.error("Error exporting chat:", error);
      await ctx.reply(
        "❌ Произошла ошибка при создании архива.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Попробовать снова", callback_data: "export_chat" }],
              [{ text: "⬅️ Главное меню", callback_data: "main_menu" }]
            ]
          }
        }
      );
    }
  }

  private generateTextExport(messages: any[], targetUserId: number, userName: string, targetUsername: string): string {
    let exportText = `ЭКСПОРТ ПЕРЕПИСКИ\n`;
    exportText += `Участники: ${userName} и ${targetUsername}\n`;
    exportText += `Дата экспорта: ${new Date().toLocaleString('ru-RU')}\n`;
    exportText += `Всего сообщений: ${messages.length}\n\n`;
    exportText += '='.repeat(60) + '\n\n';

    messages.forEach((message, index) => {
      const date = new Date(message.sentAt).toLocaleString('ru-RU');
      const isFromTargetUser = message.senderId === targetUserId;
      const sender = isFromTargetUser ? targetUsername : userName;
      
      exportText += `[${date}] ${sender}:\n`;
      
      if (message.hasMedia) {
        exportText += `📸 ФОТОГРАФИЯ\n`;
      } else if (message.hasVoice) {
        exportText += `🎤 ГОЛОСОВОЕ СООБЩЕНИЕ\n`;
      } else if (message.hasVideo) {
        exportText += `🎥 ВИДЕОСООБЩЕНИЕ\n`;
      } else if (message.hasVideoFile) {
        exportText += `🎬 ОБЫЧНОЕ ВИДЕО\n`; // ДОБАВЛЯЕМ ОБЫЧНЫЕ ВИДЕО
      } else {
        exportText += `${message.text}\n`;
      }
      
      if (message.isEdited) {
        exportText += `(отредактировано)\n`;
      }
      if (message.isDeleted) {
        exportText += `(удалено)\n`;
      }
      
      exportText += '\n' + '-'.repeat(40) + '\n\n';
    });

    return exportText;
  }

  private getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '.jpg';
  }

  private deleteFolderRecursive(path: string) {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file) => {
        const curPath = join(path, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this.deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(path);
    }
  }
}