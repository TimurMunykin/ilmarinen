import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly rsaPrivateKey: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    this.rsaPrivateKey = this.config.getOrThrow('RSA_PRIVATE_KEY');
  }

  async validateOAuthLogin(data: { googleId: string; email: string; name: string | null }) {
    return this.prisma.user.upsert({
      where: { googleId: data.googleId },
      update: { email: data.email, name: data.name },
      create: { googleId: data.googleId, email: data.email, name: data.name },
    });
  }

  generateToken(user: { id: string; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  generateAppToken(
    user: { id: string; email: string; name: string | null },
    appSubdomain: string,
  ): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, name: user.name, app: appSubdomain },
      { privateKey: this.rsaPrivateKey, algorithm: 'RS256', expiresIn: '7d' },
    );
  }
}
