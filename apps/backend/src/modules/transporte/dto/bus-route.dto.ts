import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Length, Matches, Min, Max } from 'class-validator';

export class CreateBusRouteDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  code: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(7)
  route_type?: number; // GTFS types

  @IsString()
  @IsOptional()
  @Length(6, 6)
  @Matches(/^[0-9A-F]{6}$/i, { message: 'color must be a valid hex color without #' })
  color?: string;

  @IsString()
  @IsOptional()
  @Length(6, 6)
  @Matches(/^[0-9A-F]{6}$/i, { message: 'text_color must be a valid hex color without #' })
  text_color?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  agency?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  frequency_minutes?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  fare_price?: number;
}

export class UpdateBusRouteDto {
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
  @Min(0)
  @Max(7)
  route_type?: number;

  @IsString()
  @IsOptional()
  @Length(6, 6)
  @Matches(/^[0-9A-F]{6}$/i)
  color?: string;

  @IsString()
  @IsOptional()
  @Length(6, 6)
  @Matches(/^[0-9A-F]{6}$/i)
  text_color?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  agency?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  frequency_minutes?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  fare_price?: number;
}

export class RouteGeometryDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  direction?: number;

  @IsNotEmpty()
  geometry: any; // GeoJSON LineString

  @IsNumber()
  @IsOptional()
  @Min(0)
  distance_km?: number;
}

export class AddStopToRouteDto {
  @IsNumber()
  @IsNotEmpty()
  stop_id: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  stop_sequence: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  direction?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  distance_from_start_km?: number;
}
