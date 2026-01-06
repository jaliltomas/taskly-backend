import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all chats sorted by last message time
   */
  async getAllChats(page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.chat.findMany({
        skip,
        take: pageSize,
        orderBy: { lastMessageAt: 'desc' },
      }),
      this.prisma.chat.count(),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get a single chat by ID
   */
  async getChatById(id: number) {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${id} not found`);
    }

    return chat;
  }

  /**
   * Get chat by phone number
   */
  async getChatByPhone(phoneNumber: string) {
    return this.prisma.chat.findUnique({
      where: { phoneNumber },
    });
  }

  /**
   * Get messages for a specific chat
   */
  async getChatMessages(chatId: number, page = 1, pageSize = 100) {
    // Verify chat exists
    await this.getChatById(chatId);

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { chatId },
        skip,
        take: pageSize,
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.chatMessage.count({ where: { chatId } }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Create or update a chat record
   */
  async createOrUpdateChat(phoneNumber: string, name?: string) {
    const existing = await this.prisma.chat.findUnique({
      where: { phoneNumber },
    });

    if (existing) {
      // Update name if provided
      if (name && name !== existing.name) {
        return this.prisma.chat.update({
          where: { id: existing.id },
          data: { name },
        });
      }
      return existing;
    }

    // Create new chat
    return this.prisma.chat.create({
      data: {
        phoneNumber,
        name: name || phoneNumber,
      },
    });
  }

  /**
   * Add a message to a chat
   */
  async addMessage(
    phoneNumber: string,
    content: string,
    fromMe: boolean,
    senderName?: string,
  ) {
    // Get or create chat
    let chat = await this.prisma.chat.findUnique({
      where: { phoneNumber },
    });

    if (!chat) {
      chat = await this.prisma.chat.create({
        data: {
          phoneNumber,
          name: senderName || phoneNumber,
        },
      });
    }

    // Create the message
    const message = await this.prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        content,
        fromMe,
        status: fromMe ? 'sent' : 'received',
      },
    });

    // Update chat with last message info
    const updateData: any = {
      lastMessage: content.substring(0, 200),
      lastMessageAt: new Date(),
    };

    // Increment unread count if incoming message
    if (!fromMe) {
      updateData.unreadCount = { increment: 1 };
      // Update name if we have a sender name
      if (senderName && chat.name === chat.phoneNumber) {
        updateData.name = senderName;
      }
    }

    await this.prisma.chat.update({
      where: { id: chat.id },
      data: updateData,
    });

    this.logger.log(
      `Message ${fromMe ? 'sent to' : 'received from'} ${phoneNumber}`,
    );

    return message;
  }

  /**
   * Mark all messages in a chat as read
   */
  async markAsRead(chatId: number) {
    await this.getChatById(chatId);

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    });

    return { success: true };
  }

  /**
   * Get total unread count across all chats
   */
  async getTotalUnreadCount() {
    const result = await this.prisma.chat.aggregate({
      _sum: { unreadCount: true },
    });

    return { unreadCount: result._sum.unreadCount || 0 };
  }

  /**
   * Clear all CRM data (called when WhatsApp disconnects)
   */
  async clearAllData() {
    this.logger.log('🗑️ Clearing all CRM and message data...');

    // Delete all CRM messages first (due to foreign key constraint)
    const deletedCrmMessages = await this.prisma.chatMessage.deleteMany({});
    this.logger.log(`Deleted ${deletedCrmMessages.count} CRM messages`);

    // Delete all CRM chats
    const deletedChats = await this.prisma.chat.deleteMany({});
    this.logger.log(`Deleted ${deletedChats.count} chats`);

    // Delete all raw messages (dashboard messages)
    const deletedRawMessages = await this.prisma.rawMessage.deleteMany({});
    this.logger.log(`Deleted ${deletedRawMessages.count} raw messages`);

    return {
      success: true,
      deletedCrmMessages: deletedCrmMessages.count,
      deletedChats: deletedChats.count,
      deletedRawMessages: deletedRawMessages.count,
    };
  }
}


