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

      return { success: true, message: 'Session disconnected' };
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
}
