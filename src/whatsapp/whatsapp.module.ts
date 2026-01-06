import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WebhookModule } from '../webhook/webhook.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [forwardRef(() => WebhookModule), forwardRef(() => CrmModule)],
  providers: [WhatsappService],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}


