import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';

interface WhatsAppPayload {
  from?: string;
  chatId?: string;
  body?: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('whatsapp')
  async handleWhatsApp(@Body() payload: WhatsAppPayload) {
    const rawPhone = payload.from || payload.chatId || '';
    const phoneNumber = rawPhone.replace('@c.us', '').replace(/\D/g, '');
    const messageBody = payload.body || '';

    if (!phoneNumber) {
      this.logger.warn('Received webhook without phone number');
      return {
        status: 'error',
        message: 'Missing phone number',
      };
    }

    if (!messageBody) {
      this.logger.warn(`Received empty message from ${phoneNumber}`);
      return {
        status: 'ignored',
        message: 'Empty message body',
      };
    }

    this.logger.log(
      `Received message from ${phoneNumber}: ${messageBody.slice(0, 100)}...`,
    );

    // Process in background (non-blocking)
    this.webhookService
      .processMessage(phoneNumber, messageBody)
      .catch((err) => this.logger.error('Error processing message:', err));

    return {
      status: 'accepted',
      message: 'Message queued for processing',
    };
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'healthy',
      service: 'whatsapp-webhook',
    };
  }
}
