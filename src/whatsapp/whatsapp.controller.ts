import { Controller, Get, Post, Body, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * Get current connection status
   */
  @Get('status')
  getStatus() {
    return this.whatsappService.getStatus();
  }

  /**
   * SSE endpoint for real-time QR code and status updates
   */
  @Get('qr-stream')
  qrStream(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.whatsappService.addSseClient(res);
  }

  /**
   * Disconnect current WhatsApp session
   */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect() {
    return this.whatsappService.disconnect();
  }

  /**
   * Send a WhatsApp message
   */
  @Post('send')
  async sendMessage(@Body() body: { to: string; message: string }) {
    if (!body.to || !body.message) {
      return { success: false, error: 'Missing parameters' };
    }

    try {
      return await this.whatsappService.sendMessage(body.to, body.message);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
