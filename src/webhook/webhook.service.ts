import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../ai/llm.service';
import { VectorService } from '../ai/vector.service';
import { PriceService } from '../ai/price.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: LlmService,
    private vectorService: VectorService,
    private priceService: PriceService,
  ) {}

  async processMessage(phoneNumber: string, content: string) {
    this.logger.log(`[STEP 1] Starting message processing for ${phoneNumber}`);
    this.logger.log(`[STEP 1] Content preview: ${content.slice(0, 200)}...`);

    // Create raw message record
    const rawMessage = await this.prisma.rawMessage.create({
      data: {
        phoneNumber,
        content,
        status: 'pending',
      },
    });
    this.logger.log(`[STEP 1] Created rawMessage id=${rawMessage.id}`);

    try {
      // Step 1: Find provider
      this.logger.log(`[STEP 2] Looking for provider with phone: ${phoneNumber}`);
      const provider = await this.prisma.provider.findUnique({
        where: { phoneNumber },
      });

      if (!provider) {
        await this.prisma.rawMessage.update({
          where: { id: rawMessage.id },
          data: {
            status: 'ignored',
            errorMessage: 'Provider not found',
          },
        });
        this.logger.warn(`[STEP 2] IGNORED: Provider not found for ${phoneNumber}`);
        return;
      }

      this.logger.log(`[STEP 2] Found provider: id=${provider.id}, name=${provider.name}, isActive=${provider.isActive}`);

      if (!provider.isActive) {
        await this.prisma.rawMessage.update({
          where: { id: rawMessage.id },
          data: {
            status: 'ignored',
            errorMessage: 'Provider is inactive',
            providerId: provider.id,
          },
        });
        this.logger.warn(`[STEP 2] IGNORED: Provider ${provider.name} is inactive`);
        return;
      }

      await this.prisma.rawMessage.update({
        where: { id: rawMessage.id },
        data: { providerId: provider.id },
      });

      // Step 2: Detect if it's a price list
      this.logger.log(`[STEP 3] Calling LLM to detect price list...`);
      const detection = await this.llmService.detectPriceList(content);
      this.logger.log(`[STEP 3] Detection result: esLista=${detection.esLista}`);

      if (!detection.esLista) {
        await this.prisma.rawMessage.update({
          where: { id: rawMessage.id },
          data: {
            status: 'ignored',
            errorMessage: 'Not a price list',
          },
        });
        this.logger.warn(`[STEP 3] IGNORED: Message is not a price list`);
        return;
      }

      // Step 3: Parse products
      this.logger.log(`[STEP 4] Parsing products from message...`);
      const parseResult = await this.llmService.parseProducts(content);
      this.logger.log(`[STEP 4] Parse result: esLista=${parseResult.esLista}, productCount=${parseResult.productos?.length || 0}`);

      if (!parseResult.esLista || !parseResult.productos.length) {
        await this.prisma.rawMessage.update({
          where: { id: rawMessage.id },
          data: {
            status: 'ignored',
            errorMessage: 'No products found',
          },
        });
        this.logger.warn(`[STEP 4] IGNORED: No products found in message`);
        return;
      }

      // Get categories for classification
      const categories = await this.prisma.category.findMany();
      const categoryNames = categories.map((c) => c.name);
      if (!categoryNames.length) categoryNames.push('Otros');
      this.logger.log(`[STEP 5] Loaded ${categories.length} categories: ${categoryNames.join(', ')}`);

      let productsProcessed = 0;

      // Step 4: Process each product
      this.logger.log(`[STEP 6] Processing ${parseResult.productos.length} products...`);
      for (const parsed of parseResult.productos) {
        try {
          this.logger.log(`[STEP 6] Processing: "${parsed.nombre}" @ $${parsed.precio}`);
          await this.processProduct(
            parsed.nombre,
            parsed.precio,
            provider.id,
            categories,
            categoryNames,
          );
          productsProcessed++;
        } catch (err) {
          this.logger.error(`[STEP 6] Error processing "${parsed.nombre}":`, err);
        }
      }

      // Update message status
      await this.prisma.rawMessage.update({
        where: { id: rawMessage.id },
        data: {
          status: 'processed',
          productsCount: productsProcessed,
        },
      });

      this.logger.log(
        `[COMPLETE] Processed ${productsProcessed}/${parseResult.productos.length} products from ${provider.name}`,
      );
    } catch (err) {
      this.logger.error('[ERROR] Error processing message:', err);
      await this.prisma.rawMessage.update({
        where: { id: rawMessage.id },
        data: {
          status: 'ignored',
          errorMessage: String(err),
        },
      });
    }
  }

  private async processProduct(
    rawName: string,
    price: number,
    providerId: number,
    categories: any[],
    categoryNames: string[],
  ) {
    const cleanPrice = this.priceService.cleanPrice(price);

    // Generate embedding for search
    const queryEmbedding =
      await this.vectorService.generateQueryEmbedding(rawName);

    // Search for similar products
    const match = await this.vectorService.findBestMatch(queryEmbedding, 0.65);

    let matchedProduct: any = null;

    if (match && match.similarity >= 0.65) {
      // Validate identity with LLM
      const validation = await this.llmService.validateProductIdentity(
        rawName,
        match.name_normalized,
      );

      if (validation.esMismo) {
        matchedProduct = match;
      }
    }

    if (matchedProduct) {
      // Update existing product
      await this.updateExistingProduct(
        matchedProduct,
        rawName,
        cleanPrice,
        providerId,
        categories,
      );
    } else {
      // Create new product
      await this.createNewProduct(
        rawName,
        cleanPrice,
        providerId,
        categories,
      );
    }
  }

  private async updateExistingProduct(
    product: any,
    rawName: string,
    newPrice: number,
    providerId: number,
    categories: any[],
  ) {
    // Record price history
    await this.prisma.priceHistory.create({
      data: {
        productId: product.id,
        providerId,
        rawName,
        price: newPrice,
      },
    });

    // Only update if new price is lower
    if (newPrice < product.last_price || product.last_price === 0) {
      const category = categories.find((c) => c.id === product.category_id);

      let prices: { retail: number; reseller: number };
      if (category) {
        prices = this.priceService.calculateSuggestedPrices(newPrice, category);
      } else {
        prices = this.priceService.calculateDefaultPrices(newPrice);
      }

      await this.prisma.productUnique.update({
        where: { id: product.id },
        data: {
          lastPrice: newPrice,
          bestProviderId: providerId,
          suggestedPriceRetail: prices.retail,
          suggestedPriceReseller: prices.reseller,
        },
      });

      this.logger.log(`Updated price for ${product.name_normalized}: $${newPrice}`);
    }
  }

  private async createNewProduct(
    rawName: string,
    price: number,
    providerId: number,
    categories: any[],
  ) {
    // Normalize product name
    const normalizedName = await this.llmService.normalizeProductName(rawName);

    // Classify category (pass full categories for LLM descriptions)
    const classification = await this.llmService.classifyCategory(
      normalizedName,
      price,
      categories,
    );

    const category = categories.find(
      (c) => c.name.toLowerCase() === classification.categoria.toLowerCase(),
    );

    // Calculate suggested prices
    let prices: { retail: number; reseller: number };
    if (category) {
      prices = this.priceService.calculateSuggestedPrices(price, category);
    } else {
      prices = this.priceService.calculateDefaultPrices(price);
    }

    // Generate document embedding
    const docEmbedding =
      await this.vectorService.generateEmbedding(normalizedName);

    // Create product
    const productId = await this.vectorService.insertProductWithEmbedding({
      nameNormalized: normalizedName,
      categoryId: category?.id,
      embedding: docEmbedding,
      lastPrice: price,
      bestProviderId: providerId,
      suggestedPriceRetail: prices.retail,
      suggestedPriceReseller: prices.reseller,
      metadata: { originalName: rawName },
    });

    // Record price history
    await this.prisma.priceHistory.create({
      data: {
        productId,
        providerId,
        rawName,
        price,
      },
    });

    this.logger.log(
      `Created new product: ${normalizedName} ($${price}) in ${classification.categoria}`,
    );
  }
}
