import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { VectorService } from './vector.service';
import { PriceService } from './price.service';

@Module({
  providers: [LlmService, VectorService, PriceService],
  exports: [LlmService, VectorService, PriceService],
})
export class AiModule {}
