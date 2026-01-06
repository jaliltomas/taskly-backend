import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Controller('crm')
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Get all chats with pagination
   */
  @Get('chats')
  async getAllChats(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.crmService.getAllChats(page || 1, pageSize || 50);
  }

  /**
   * Get a single chat by ID
   */
  @Get('chats/:id')
  async getChat(@Param('id', ParseIntPipe) id: number) {
    return this.crmService.getChatById(id);
  }

  /**
   * Get messages for a chat
   */
  @Get('chats/:id/messages')
  async getChatMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.crmService.getChatMessages(id, page || 1, pageSize || 100);
  }

  /**
   * Send a message to a chat
   */
  @Post('chats/:id/send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { message: string },
  ) {
    if (!body.message) {
      return { success: false, error: 'Message is required' };
    }

    // Get the chat to find the phone number
    const chat = await this.crmService.getChatById(id);

    // Format phone number for WhatsApp (needs @c.us suffix)
    const whatsappId = chat.phoneNumber.includes('@')
      ? chat.phoneNumber
      : `${chat.phoneNumber}@c.us`;

    try {
      // Send via WhatsApp
      await this.whatsappService.sendMessage(whatsappId, body.message);

      // Store the sent message in CRM
      const message = await this.crmService.addMessage(
        chat.phoneNumber,
        body.message,
        true,
      );

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark a chat as read
   */
  @Post('chats/:id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.crmService.markAsRead(id);
  }

  /**
   * Get total unread count
   */
  @Get('unread-count')
  async getUnreadCount() {
    return this.crmService.getTotalUnreadCount();
  }

  /**
   * Sync all WhatsApp chats to CRM
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncChats() {
    try {
      return await this.whatsappService.syncChatsWithCRM();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync messages for a specific chat from WhatsApp
   */
  @Post('chats/:id/sync-messages')
  @HttpCode(HttpStatus.OK)
  async syncMessages(@Param('id', ParseIntPipe) id: number) {
    try {
      const chat = await this.crmService.getChatById(id);
      return await this.whatsappService.syncChatMessages(chat.phoneNumber);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all WhatsApp contacts
   */
  @Get('contacts')
  async getContacts() {
    try {
      return await this.whatsappService.getAllContacts();
    } catch (error) {
      return { success: false, contacts: [], error: error.message };
    }
  }

  /**
   * Start a new chat with a phone number
   */
  @Post('chats/new')
  @HttpCode(HttpStatus.OK)
  async createChat(@Body() body: { phoneNumber: string; name?: string }) {
    if (!body.phoneNumber) {
      return { success: false, error: 'Phone number is required' };
    }

    try {
      const chat = await this.crmService.createOrUpdateChat(
        body.phoneNumber.replace(/\D/g, ''), // Remove non-digits
        body.name,
      );
      return { success: true, chat };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}


