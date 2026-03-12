import { Controller, Get, Req, Res, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  google() {
    // Guard handles redirect
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as { googleId: string; email: string; name: string | null };
    const user = await this.authService.validateOAuthLogin(profile);

    // Check if this is an app auth delegation flow
    const state = this.parseState(req.query.state as string | undefined);
    if (state?.returnApp) {
      const appToken = this.authService.generateAppToken(user, state.returnApp);
      const baseDomain = this.config.get('APPS_BASE_DOMAIN', 'apps.muntim.ru');
      return res.redirect(
        `https://${state.returnApp}.${baseDomain}/api/auth/callback?token=${appToken}`,
      );
    }

    // Normal platform login
    const token = this.authService.generateToken(user);
    return res.redirect(`/#token=${token}`);
  }

  @Get('app-login')
  @ApiOperation({ summary: 'App auth delegation — redirects through Google OAuth' })
  appLogin(@Query('app') app: string, @Res() res: Response) {
    if (!app || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(app)) {
      throw new BadRequestException('Invalid app subdomain');
    }
    return res.redirect(`/api/auth/google?returnApp=${encodeURIComponent(app)}`);
  }

  private parseState(state: string | undefined): { returnApp?: string } | null {
    if (!state) return null;
    try {
      return JSON.parse(state);
    } catch {
      return null;
    }
  }
}
