import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ru', 'en'])
  locale?: string;
}
