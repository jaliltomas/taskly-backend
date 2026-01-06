import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as wppconnect from '@wppconnect-team/wppconnect';
import * as fs from 'fs';
import * as path from 'path';
import { WebhookService } from '../webhook/webhook.service';
import { CrmService } from '../crm/crm.service';

export interface WhatsAppMessage {
  chatId: string;
  from: string;
  senderName: string;
  body: string;
  isGroupMsg: boolean;
  timestamp: number;
  originalType: string;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);

  private client: any = null;
  private lastQr: string | null = null;
  private sessionStatus: string = 'DISCONNECTED';
  private sessionStart: number = Math.floor(Date.now() / 1000);
  private sseClients: Response[] = [];
  private messageHandler: ((msg: WhatsAppMessage) => void) | null = null;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => WebhookService))
    private webhookService: WebhookService,
    @Inject(forwardRef(() => CrmService))
    private crmService: CrmService,
  ) {}

  async onModuleInit() {
    // Auto-start WhatsApp connection
    this.initSession();
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        this.logger.error('Error closing WhatsApp client', e);
      }
    }
  }

  /**
   * Set the message handler (called from webhook service)
   */
  setMessageHandler(handler: (msg: WhatsAppMessage) => void) {
    this.messageHandler = handler;
  }

  /**
   * Initialize WPPConnect session
   */
  async initSession() {
    this.sessionStart = Math.floor(Date.now() / 1000);
    this.sessionStatus = 'INITIALIZING';
    this.broadcastSSE({ status: this.sessionStatus });

    try {
      const client = await wppconnect.create({
        session: 'advance_tecno_session',
        headless: 'new',
        autoClose: 0, // 0 = disabled
        logQR: false,

        catchQR: (base64Qr: string, asciiQR: string) => {
          this.lastQr = base64Qr;
          this.sessionStatus = 'QRCODE';
          this.broadcastSSE({ qr: base64Qr, status: this.sessionStatus });
          this.logger.log('📲 New QR code generated');
        },

        statusFind: (statusSession: string) => {
          this.sessionStatus = statusSession;
          this.broadcastSSE({ status: this.sessionStatus });
          this.logger.log(`🟢 Session status: ${statusSession}`);
        },

        browserArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-infobars',
          '--no-first-run',
          '--no-zygote',
        ],
      } as any);

      this.client = client;
      this.startMessageListener();
      this.logger.log('✅ WhatsApp client started successfully');
    } catch (error) {
      this.logger.error('❌ Error starting WPPConnect:', error);
      this.sessionStatus = 'ERROR';
      this.broadcastSSE({ status: 'ERROR', error: error.message });
    }
  }

  /**
   * Start listening for incoming messages
   */
  private startMessageListener() {
    if (!this.client) return;

    this.client.onMessage(async (message: any) => {
      // Skip own messages
      if (message.fromMe) return;
      // Skip old messages
      if (!message.isNewMsg) return;
      if (message.timestamp < this.sessionStart) return;

      // Extract text
      let text = '';
      if (message.caption) {
        text = message.caption;
      } else if (message.type === 'chat') {
        text = message.body || '';
      }
      text = text.trim();

      // Skip if no text
      if (!text) return;

      this.logger.log(`📩 New message (${message.type}): ${text.substring(0, 50)}...`);

      // Extract phone number (remove @c.us suffix)
      const phoneNumber = message.from.replace('@c.us', '');

      // Get sender name from message
      const senderName = message.notifyName || message.pushname || phoneNumber;

      // Store message in CRM
      try {
        await this.crmService.addMessage(phoneNumber, text, false, senderName);
        this.logger.log(`💬 Message stored in CRM from ${senderName}`);
      } catch (error) {
        this.logger.error(`❌ Error storing message in CRM: ${error.message}`);
      }

      // Process message through webhook service
      try {
        await this.webhookService.processMessage(phoneNumber, text);
        this.logger.log(`✅ Message processed for ${phoneNumber}`);
      } catch (error) {
        this.logger.error(`❌ Error processing message: ${error.message}`);
      }
    });
  }

  /**
   * Get current session status
   */
  getStatus() {
    return {
      status: this.sessionStatus,
      hasQr: !!this.lastQr,
      connectedAt: this.sessionStatus === 'CONNECTED' ? this.sessionStart : null,
    };
  }

  /**
   * Get last QR code
   */
  getQrCode() {
    return this.lastQr;
  }

  /**
   * Add SSE client for real-time updates
   */
  addSseClient(res: Response) {
    this.sseClients.push(res);

    // Send current state immediately
    res.write(
      `data: ${JSON.stringify({ qr: this.lastQr, status: this.sessionStatus })}\n\n`,
    );

    // Remove on disconnect
    res.on('close', () => {
      this.sseClients = this.sseClients.filter((client) => client !== res);
    });
  }

  /**
   * Broadcast to all SSE clients
   */
  private broadcastSSE(data: any) {
    this.sseClients.forEach((res) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }

  /**
   * Disconnect current session
   */
  async disconnect() {
    if (!this.client) {
      return { success: false, message: 'No active session' };
    }

    try {
      this.logger.log('🔴 Disconnecting session...');

      // Clear all CRM data first
      try {
        await this.crmService.clearAllData();
        this.logger.log('✅ CRM data cleared');
      } catch (e) {
        this.logger.warn('Could not clear CRM data:', e.message);
      }

      // Logout and close
      try {
        await this.client.logout();
      } catch (e) {
        this.logger.warn('Logout warning:', e.message);
      }
      
      try {
        await this.client.close();
      } catch (e) {
        this.logger.warn('Close warning:', e.message);
      }

      this.client = null;
      this.sessionStatus = 'DISCONNECTED';
      this.lastQr = null;
      this.broadcastSSE({ status: 'DISCONNECTED', qr: null });

      // Wait a bit for browser to fully close, then delete tokens
      setTimeout(() => {
        const tokenPath = path.join(
          process.cwd(),
          'tokens',
          'advance_tecno_session',
        );
        try {
          if (fs.existsSync(tokenPath)) {
            fs.rmSync(tokenPath, { recursive: true, force: true });
            this.logger.log('🗑 Tokens deleted');
          }
        } catch (e) {
          this.logger.warn('Could not delete tokens:', e.message);
        }
      }, 1000);

      // Auto-restart after 3 seconds
      setTimeout(() => {
        this.logger.log('🔄 Auto-restarting session...');
        this.initSession();
      }, 3000);

      return { success: true, message: 'Session disconnected and CRM data cleared' };
    } catch (error) {
      this.logger.error('Error disconnecting:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(to: string, message: string) {
    if (!this.client) {
      throw new Error('WhatsApp client not connected');
    }

    await this.client.sendText(to, message);
    return { success: true };
  }

  /**
   * Get all existing WhatsApp chats and sync to CRM
   */
  async syncChatsWithCRM() {
    if (!this.client) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      this.logger.log('🔄 Fetching WhatsApp chats...');
      
      // Get all chats from WhatsApp using listChats
      const chats = await this.client.listChats();
      
      this.logger.log(`📱 Found ${chats.length} chats`);

      let synced = 0;
      for (const chat of chats) {
        // Skip groups and broadcast lists
        if (chat.isGroup || chat.id.server !== 'c.us') continue;

        const phoneNumber = chat.id.user;
        const name = chat.name || chat.contact?.pushname || chat.contact?.name || phoneNumber;
        
        try {
          // Create or update chat in CRM
          await this.crmService.createOrUpdateChat(phoneNumber, name);
          
          // If chat has last message, update it
          if (chat.lastMessage) {
            const lastMsgContent = chat.lastMessage.body || chat.lastMessage.caption || '';
            if (lastMsgContent) {
              // We'll just store one recent message to show in list
              await this.crmService.addMessage(
                phoneNumber,
                lastMsgContent,
                chat.lastMessage.fromMe || false,
                name,
              );
            }
          }
          synced++;
        } catch (error) {
          this.logger.warn(`Could not sync chat ${phoneNumber}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Synced ${synced} chats to CRM`);
      return { success: true, synced, total: chats.length };
    } catch (error) {
      this.logger.error('Error syncing chats:', error);
      throw error;
    }
  }

  /**
   * Get chat messages from WhatsApp and sync to CRM
   */
  async syncChatMessages(phoneNumber: string, limit = 50) {
    if (!this.client) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      const chatId = `${phoneNumber}@c.us`;
      
      this.logger.log(`🔄 Fetching messages for ${phoneNumber}...`);
      
      // Try different methods to get messages
      let messages = [];
      
      try {
        // First try getAllMessagesInChat
        messages = await this.client.getAllMessagesInChat(chatId, true, true);
      } catch (e) {
        this.logger.warn(`getAllMessagesInChat failed, trying alternative: ${e.message}`);
        try {
          // Try loadEarlierMessages
          messages = await this.client.loadEarlierMessages(chatId);
        } catch (e2) {
          this.logger.warn(`loadEarlierMessages also failed: ${e2.message}`);
          // Return empty if we can't get messages
          return { success: true, synced: 0, message: 'Could not load messages from WhatsApp' };
        }
      }
      
      if (!messages || !Array.isArray(messages)) {
        this.logger.warn('No messages array returned');
        return { success: true, synced: 0 };
      }
      
      // Take only the last N messages
      const recentMessages = messages.slice(-limit);
      
      this.logger.log(`📨 Found ${recentMessages.length} messages`);

      // Get sender name from contact
      let senderName = phoneNumber;
      try {
        const contact = await this.client.getContact(chatId);
        senderName = contact?.pushname || contact?.name || phoneNumber;
      } catch (e) {
        // Ignore contact fetch errors
      }

      let syncedCount = 0;
      // Sync messages to CRM
      for (const msg of recentMessages) {
        const content = msg.body || msg.caption || '';
        if (!content) continue;

        try {
          await this.crmService.addMessage(
            phoneNumber,
            content,
            msg.fromMe || false,
            senderName,
          );
          syncedCount++;
        } catch (e) {
          // Skip duplicate messages (unique constraint)
        }
      }

      return { success: true, synced: syncedCount };
    } catch (error) {
      this.logger.error(`Error syncing messages for ${phoneNumber}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all contacts from WhatsApp
   */
  async getAllContacts() {
    if (!this.client) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      const contacts = await this.client.getAllContacts();
      
      // Filter to only include real contacts (with names or saved)
      const validContacts = contacts
        .filter((c: any) => 
          !c.isGroup && 
          !c.isMe && 
          c.id?.server === 'c.us' &&
          (c.name || c.pushname || c.isMyContact)
        )
        .map((c: any) => ({
          phoneNumber: c.id?.user || '',
          name: c.name || c.pushname || c.id?.user || '',
          isMyContact: c.isMyContact || false,
        }));

      return { success: true, contacts: validContacts };
    } catch (error) {
      this.logger.error('Error getting contacts:', error);
      throw error;
    }
  }
}


