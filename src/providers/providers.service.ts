import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto, UpdateProviderDto } from './providers.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    isActive?: boolean;
    skip?: number;
    limit?: number;
  }) {
    const skip = params.skip ?? 0;
    const limit = params.limit ?? 100;

    return this.prisma.provider.findMany({
      where: params.isActive !== undefined ? { isActive: params.isActive } : {},
      skip: Number(skip) || 0,
      take: Number(limit) || 100,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }

  async findByPhone(phoneNumber: string) {
    const normalized = phoneNumber.replace(/\D/g, '');

    const provider = await this.prisma.provider.findUnique({
      where: { phoneNumber: normalized },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }

  async create(dto: CreateProviderDto) {
    const normalizedPhone = dto.phone_number.replace(/\D/g, '');

    const existing = await this.prisma.provider.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (existing) {
      throw new ConflictException('Provider with this phone already exists');
    }

    return this.prisma.provider.create({
      data: {
        name: dto.name,
        phoneNumber: normalizedPhone,
        isActive: dto.is_active ?? true,
      },
    });
  }

  async update(id: number, dto: UpdateProviderDto) {
    await this.findOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;
    if (dto.phone_number !== undefined) {
      data.phoneNumber = dto.phone_number.replace(/\D/g, '');
    }

    return this.prisma.provider.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.provider.delete({ where: { id } });
  }
}
