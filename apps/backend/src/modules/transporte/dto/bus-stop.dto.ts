import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Length, Min, Max } from 'class-validator';

export class CreateBusStopDto {
  @IsString()
  @IsOptional()
  @Length(1, 20)
  code?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  zone?: string;

  @IsBoolean()
  @IsOptional()
  has_shelter?: boolean;

  @IsBoolean()
  @IsOptional()
  has_bench?: boolean;

  @IsBoolean()
  @IsOptional()
  has_lighting?: boolean;

  @IsBoolean()
  @IsOptional()
  accessibility?: boolean;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateBusStopDto {
  @IsString()
  @IsOptional()
  @Length(1, 20)
  code?: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  zone?: string;

  @IsBoolean()
  @IsOptional()
  has_shelter?: boolean;

  @IsBoolean()
  @IsOptional()
  has_bench?: boolean;

  @IsBoolean()
  @IsOptional()
  has_lighting?: boolean;

  @IsBoolean()
  @IsOptional()
  accessibility?: boolean;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class FindNearbyStopsDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsNumber()
  @IsOptional()
  @Min(100)
  @Max(5000)
  radius?: number; // metros, default 500
}
