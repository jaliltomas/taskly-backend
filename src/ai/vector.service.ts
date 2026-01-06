import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);
  private genAI: GoogleGenerativeAI;
  private similarityThreshold: number;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey || '');
    this.similarityThreshold =
      this.configService.get<number>('SIMILARITY_THRESHOLD') || 0.85;
  }

  /**
   * Generate embedding for document (product catalog)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const prefixedText = `passage: ${text}`;

    const model = this.genAI.getGenerativeModel({
      model: 'text-embedding-004',
    });

    const result = await model.embedContent(prefixedText);
    return result.embedding.values;
  }

  /**
   * Generate embedding for query (search)
   */
  async generateQueryEmbedding(text: string): Promise<number[]> {
    const prefixedText = `query: ${text}`;

    const model = this.genAI.getGenerativeModel({
      model: 'text-embedding-004',
    });

    const result = await model.embedContent(prefixedText);
    return result.embedding.values;
  }

  /**
   * Find similar products using pgvector
   */
  async findSimilarProducts(
    embedding: number[],
    limit: number = 5,
    threshold?: number,
  ) {
    const effectiveThreshold = threshold ?? this.similarityThreshold;

    try {
      const results = await this.prisma.findSimilarProducts(
        embedding,
        effectiveThreshold,
        limit,
      );
      return results;
    } catch (error) {
      this.logger.error('Error finding similar products:', error);
      return [];
    }
  }

  /**
   * Find best matching product
   */
  async findBestMatch(embedding: number[], threshold?: number) {
    const results = await this.findSimilarProducts(embedding, 1, threshold);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Insert new product with embedding
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
    return this.prisma.insertProductWithEmbedding(data);
  }
}
