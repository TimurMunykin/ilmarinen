import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const returnApp = request.query.returnApp;
    if (returnApp) {
      return { state: JSON.stringify({ returnApp }) };
    }
    return {};
  }
}
