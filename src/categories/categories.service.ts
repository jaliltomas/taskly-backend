import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { skip?: number; limit?: number }) {
    const { skip = 0, limit = 100 } = params;

    return this.prisma.category.findMany({
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findByName(name: string) {
    const category = await this.prisma.category.findUnique({
      where: { name },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    return this.prisma.category.create({
      data: dto,
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
  }

  async seedDefaults() {
    const defaults = [
      { name: 'iPhone', description: 'iPhones nuevos sellados de cualquier modelo', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'iPhone Usado', description: 'iPhones usados con porcentaje de batería indicado', markupRetail: 0.12, markupReseller: 0.04, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Samsung', description: 'Celulares Samsung Galaxy nuevos', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Samsung Usado', description: 'Celulares Samsung usados', markupRetail: 0.12, markupReseller: 0.04, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Motorola', description: 'Celulares Motorola y Moto G', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Xiaomi', description: 'Celulares Xiaomi, Redmi y Poco', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Apple Watch', description: 'Relojes Apple Watch de cualquier serie', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'iPad', description: 'Tablets iPad de cualquier modelo', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'MacBook', description: 'Notebooks MacBook Air y Pro', markupRetail: 0.12, markupReseller: 0.04, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'AirPods', description: 'Auriculares AirPods y AirPods Pro', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Accesorios', description: 'Fundas, cargadores, cables y otros accesorios', markupRetail: 0.25, markupReseller: 0.10, isRetailPercentage: true, isResellerPercentage: true },
      { name: 'Otros', description: 'Productos que no encajan en ninguna otra categoría', markupRetail: 0.15, markupReseller: 0.05, isRetailPercentage: true, isResellerPercentage: true },
    ];

    const created = [];

    for (const cat of defaults) {
      const existing = await this.prisma.category.findUnique({
        where: { name: cat.name },
      });

      if (!existing) {
        const newCat = await this.prisma.category.create({ data: cat });
        created.push(newCat);
      }
    }

    return created;
  }
}
