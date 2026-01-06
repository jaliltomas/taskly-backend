import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateProviderDto {
  @IsString()
  name: string;

  @IsString()
  phone_number: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone_number?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

