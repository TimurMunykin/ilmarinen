// platform/apps/api/src/modules/apps/create-app.dto.ts
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateAppDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/, {
    message: 'subdomain must be lowercase alphanumeric with hyphens, 3-64 chars',
  })
  subdomain!: string;
}
