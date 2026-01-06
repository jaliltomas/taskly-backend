import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('category_id') categoryId?: number,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll({
      page: page || 1,
      pageSize: pageSize || 50,
      categoryId,
      search,
    });
  }

  @Get('stats/summary')
  getStats() {
    return this.productsService.getStats();
  }

  @Get('lists/generate')
  generateLists() {
    return this.productsService.generateLists();
  }

  @Get('history/all')
  getAllHistory(
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('search') search?: string,
  ) {
    return this.productsService.getAllHistory({
      page: page || 1,
      pageSize: pageSize || 50,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Get(':id/history')
  getHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.getHistory(id, limit || 50);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }

  @Delete('history/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeHistoryRecord(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.removeHistoryRecord(id);
  }

  @Delete('history/date/:date')
  @HttpCode(HttpStatus.OK)
  removeHistoryByDate(@Param('date') date: string) {
    return this.productsService.removeHistoryByDate(date);
  }
}
