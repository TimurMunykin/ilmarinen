import { Controller, Get, Res, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private configService: ConfigService) {}

  @Get('login')
  @ApiOperation({ summary: 'Redirect to Ilmarinen for authentication' })
  login(@Res() res: Response) {
    const ilmarinenUrl = this.configService.getOrThrow('ILMARINEN_URL');
    const subdomain = this.configService.getOrThrow('APP_SUBDOMAIN');
    res.redirect(`${ilmarinenUrl}/auth/app-login?app=${subdomain}`);
  }

  @Get('callback')
  @ApiOperation({ summary: 'Auth callback from Ilmarinen platform' })
  callback(@Query('token') token: string, @Res() res: Response) {
    res.redirect(`/?token=${token}`);
  }
}
