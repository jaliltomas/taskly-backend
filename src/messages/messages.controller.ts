import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('status') status?: string,
    @Query('provider_id') providerId?: number,
  ) {
    return this.messagesService.findAll({
      page: page || 1,
      pageSize: pageSize || 50,
      status,
      providerId,
    });
  }

  @Get('recent')
  getRecent(@Query('limit') limit?: number) {
    return this.messagesService.getRecent(limit || 20);
  }

  @Post('recent/clear')
  @HttpCode(HttpStatus.OK)
  async clearRecent() {
    await this.messagesService.archiveAllRecent();
    return { success: true };
  }

  @Get('stats/summary')
  getStats() {
    return this.messagesService.getStats();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.messagesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.messagesService.remove(id);
  }
}
