import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsDateString, Length } from 'class-validator';

export class CreateTransportAlertDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  @Length(1, 20)
  severity?: string; // info, warning, danger

  @IsString()
  @IsOptional()
  @Length(1, 50)
  alert_type?: string; // detour, delay, construction, accident

  @IsNumber()
  @IsOptional()
  route_id?: number;

  @IsNumber()
  @IsOptional()
  stop_id?: number;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  affected_zone?: string;

  @IsDateString()
  @IsNotEmpty()
  effective_from: string;

  @IsDateString()
  @IsOptional()
  effective_to?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateTransportAlertDto {
  @IsString()
  @IsOptional()
  @Length(1, 255)
  title?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  severity?: string;

  @IsString()
  @IsOptional()
  alert_type?: string;

  @IsNumber()
  @IsOptional()
  route_id?: number;

  @IsNumber()
  @IsOptional()
  stop_id?: number;

  @IsString()
  @IsOptional()
  affected_zone?: string;

  @IsDateString()
  @IsOptional()
  effective_from?: string;

  @IsDateString()
  @IsOptional()
  effective_to?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
