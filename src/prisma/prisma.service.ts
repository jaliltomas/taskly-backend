import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Execute raw SQL for vector similarity search
   * pgvector uses <=> operator for cosine distance
   */
  async findSimilarProducts(embedding: number[], threshold: number = 0.85, limit: number = 5) {
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const results = await this.$queryRaw<Array<{
      id: number;
      name_normalized: string;
      category_id: number | null;
      last_price: number;
      best_provider_id: number | null;
      suggested_price_retail: number;
      suggested_price_reseller: number;
      metadata: any;
      similarity: number;
    }>>`
      SELECT 
        id,
        name_normalized,
        category_id,
        last_price,
        best_provider_id,
        suggested_price_retail,
        suggested_price_reseller,
        metadata,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM products_unique
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${embeddingStr}::vector) > ${threshold}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
    
    return results;
  }

  /**
   * Insert product with vector embedding
   */
  async insertProductWithEmbedding(data: {
    nameNormalized: string;
    categoryId?: number;
    embedding: number[];
    lastPrice: number;
    bestProviderId?: number;
    suggestedPriceRetail: number;
    suggestedPriceReseller: number;
    metadata?: any;
  }) {
    const embeddingStr = `[${data.embedding.join(',')}]`;
    
    const result = await this.$queryRaw<Array<{ id: number }>>`
      INSERT INTO products_unique (
        name_normalized,
        category_id,
        embedding,
        last_price,
        best_provider_id,
        suggested_price_retail,
        suggested_price_reseller,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${data.nameNormalized},
        ${data.categoryId ?? null},
        ${embeddingStr}::vector,
        ${data.lastPrice},
        ${data.bestProviderId ?? null},
        ${data.suggestedPriceRetail},
        ${data.suggestedPriceReseller},
        ${JSON.stringify(data.metadata ?? {})}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id
    `;
    
    return result[0]?.id;
  }

  /**
   * Update product embedding
   */
  async updateProductEmbedding(productId: number, embedding: number[]) {
    const embeddingStr = `[${embedding.join(',')}]`;
    
    await this.$executeRaw`
      UPDATE products_unique 
      SET embedding = ${embeddingStr}::vector, updated_at = NOW()
      WHERE id = ${productId}
    `;
  }
}
