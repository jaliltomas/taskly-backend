import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    pageSize: number;
    status?: string;
    providerId?: number;
  }) {
    const { page, pageSize, status, providerId } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (providerId) where.providerId = providerId;

    const [items, total] = await Promise.all([
      this.prisma.rawMessage.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { provider: true },
      }),
      this.prisma.rawMessage.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      page_size: pageSize,
    };
  }

  async getRecent(limit: number) {
    const items = await this.prisma.rawMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { provider: true },
    });

    return {
      items,
      total: items.length,
      page: 1,
      page_size: limit,
    };
  }

  async findOne(id: number) {
    const message = await this.prisma.rawMessage.findUnique({
      where: { id },
      include: { provider: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.rawMessage.delete({ where: { id } });
  }

  async getStats() {
    const total = await this.prisma.rawMessage.count();

    const statusCounts = await this.prisma.rawMessage.groupBy({
      by: ['status'],
      _count: true,
    });

    const totalProducts = await this.prisma.rawMessage.aggregate({
      where: { status: 'processed' },
      _sum: { productsCount: true },
    });

    return {
      total_messages: total,
      by_status: Object.fromEntries(
        statusCounts.map((s) => [s.status, s._count]),
      ),
      total_products_processed: totalProducts._sum.productsCount || 0,
    };
  }
}
