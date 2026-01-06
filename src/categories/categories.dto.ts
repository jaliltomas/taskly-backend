import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  markupRetail?: number;

  @IsNumber()
  @IsOptional()
  markupReseller?: number;

  @IsBoolean()
  @IsOptional()
  isRetailPercentage?: boolean;

  @IsBoolean()
  @IsOptional()
  isResellerPercentage?: boolean;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  markupRetail?: number;

  @IsNumber()
  @IsOptional()
  markupReseller?: number;

  @IsBoolean()
  @IsOptional()
  isRetailPercentage?: boolean;

  @IsBoolean()
  @IsOptional()
  isResellerPercentage?: boolean;
}

