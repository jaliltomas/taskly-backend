import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    pageSize: number;
    categoryId?: number;
    search?: string;
  }) {
    const { page, pageSize, categoryId, search } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (search) {
      where.nameNormalized = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.productUnique.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
          { category: { name: 'asc' } },
          { nameNormalized: 'asc' }
        ],
        include: {
          category: true,
          bestProvider: true,
        },
      }),
      this.prisma.productUnique.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      page_size: pageSize,
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.productUnique.findUnique({
      where: { id },
      include: {
        category: true,
        bestProvider: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async getHistory(productId: number, limit: number) {
    await this.findOne(productId);

    return this.prisma.priceHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        provider: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Delete price history first
    await this.prisma.priceHistory.deleteMany({
      where: { productId: id },
    });

    await this.prisma.productUnique.delete({ where: { id } });
  }

  /**
   * Delete a single price history record
   */
  async removeHistoryRecord(id: number) {
    await this.prisma.priceHistory.delete({ where: { id } });
  }

  /**
   * Delete all price history records from a specific date
   */
  async removeHistoryByDate(dateStr: string) {
    // Parse date and create start/end of day
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    this.logger.log(`Deleting records from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    const result = await this.prisma.priceHistory.deleteMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    this.logger.log(`Deleted ${result.count} records`);
    return { deleted: result.count };
  }

  /**
   * Get all price history records (for Registros page)
   */
  async getAllHistory(params: {
    page: number;
    pageSize: number;
    search?: string;
  }) {
    const { page, pageSize, search } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (search) {
      where.rawName = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.priceHistory.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              nameNormalized: true,
              category: { select: { name: true } },
            },
          },
          provider: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.priceHistory.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      page_size: pageSize,
    };
  }

  async getStats() {
    const [totalProducts, totalCategories, totalProviders, totalPriceEntries] =
      await Promise.all([
        this.prisma.productUnique.count(),
        this.prisma.category.count(),
        this.prisma.provider.count(),
        this.prisma.priceHistory.count(),
      ]);

    const productsByCategory = await this.prisma.category.findMany({
      select: {
        name: true,
        _count: {
          select: { products: true },
        },
      },
    });

    return {
      total_products: totalProducts,
      total_categories: totalCategories,
      total_providers: totalProviders,
      total_price_entries: totalPriceEntries,
      products_by_category: Object.fromEntries(
        productsByCategory.map((c) => [c.name, c._count.products]),
      ),
    };
  }

  /**
   * Generate formatted product lists for CF and RV prices
   * Similar to n8n flow that generated WhatsApp-ready price lists
   */
  async generateLists() {
    // Get all products grouped by category
    const products = await this.prisma.productUnique.findMany({
      include: {
        category: true,
      },
      orderBy: [
        { category: { name: 'asc' } },
        { suggestedPriceRetail: 'asc' },
      ],
    });

    // Get categories for ordering
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    // Group products by category
    const groupedData: Record<string, Array<{
      name: string;
      priceCF: number;
      priceRV: number;
    }>> = {};

    for (const product of products) {
      const catName = product.category?.name || 'OTROS';
      
      if (!groupedData[catName]) {
        groupedData[catName] = [];
      }

      groupedData[catName].push({
        name: product.nameNormalized,
        priceCF: product.suggestedPriceRetail,
        priceRV: product.suggestedPriceReseller,
      });
    }

    // Build lists
    const date = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const buildList = (type: 'CF' | 'RV'): string => {
      const priceField = type === 'CF' ? 'priceCF' : 'priceRV';
      const title = type === 'CF' ? 'CONSUMIDOR FINAL' : 'REVENDEDOR';
      let text = `💎 *LISTADO ${title}* 💎\n📅 ${date}\n`;

      // Use category order from database
      const catOrder = categories.map(c => c.name);
      
      // Add categories that exist in products but not in DB
      const catsInProducts = Object.keys(groupedData);
      for (const cat of catsInProducts) {
        if (!catOrder.includes(cat)) {
          catOrder.push(cat);
        }
      }

      for (const catName of catOrder) {
        const productsInCat = groupedData[catName];
        
        if (productsInCat && productsInCat.length > 0) {
          text += `\n*▪️ ${catName}*\n`;
          
          // Sort alphabetically within category
          productsInCat.sort((a, b) => a.name.localeCompare(b.name));
          
          for (const p of productsInCat) {
            text += `▪️ ${p.name} – u$${Math.round(p[priceField])}\n`;
          }
        }
      }

      return text.trim();
    };

    const listCF = buildList('CF');
    const listRV = buildList('RV');
    const totalCats = Object.keys(groupedData).length;

    // Save to database
    const savedList = await this.prisma.priceList.create({
      data: {
        listCF,
        listRV,
        totalProducts: products.length,
        totalCategories: totalCats,
      },
    });

    return {
      id: savedList.id,
      listCF,
      listRV,
      totalProducts: products.length,
      totalCategories: totalCats,
      generatedAt: savedList.createdAt.toISOString(),
    };
  }

  /**
   * Get all saved price lists (history)
   */
  async getAllLists(page: number = 1, pageSize: number = 10) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.priceList.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          totalProducts: true,
          totalCategories: true,
          createdAt: true,
        },
      }),
      this.prisma.priceList.count(),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get a specific price list by ID
   */
  async getListById(id: number) {
    const list = await this.prisma.priceList.findUnique({
      where: { id },
    });

    if (!list) {
      throw new NotFoundException('Price list not found');
    }

    return {
      id: list.id,
      listCF: list.listCF,
      listRV: list.listRV,
      totalProducts: list.totalProducts,
      totalCategories: list.totalCategories,
      generatedAt: list.createdAt.toISOString(),
    };
  }

  /**
   * Delete a price list
   */
  async deleteList(id: number) {
    await this.prisma.priceList.delete({
      where: { id },
    });
  }
}

