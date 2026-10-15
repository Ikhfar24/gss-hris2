import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { isTrustedBrowserOrigin, isUnsafeMethod, trustedOrigins } from './common/security/trusted-origin';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = trustedOrigins(process.env.CORS_ORIGIN);
  const trustProxyHops = process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 0;
  app.set('trust proxy', trustProxyHops);

  app.use(helmet({ hsts: isProduction ? undefined : false }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.cookies && req.headers.cookie) {
      const cookies: Record<string, string> = {};
      const pairs = req.headers.cookie.split(';');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > 0) {
          const key = pair.substring(0, idx).trim();
          const val = pair.substring(idx + 1).trim();
          cookies[key] = decodeURIComponent(val);
        }
      }
      (req as any).cookies = cookies;
    } else if (!req.cookies) {
      (req as any).cookies = {};
    }
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (isUnsafeMethod(req.method) && !isTrustedBrowserOrigin(origin, allowedOrigins)) {
      res.status(403).json({ statusCode: 403, message: 'Origin permintaan tidak diizinkan', error: 'Forbidden' });
      return;
    }
    const path = req.originalUrl || req.url || req.path;
    if (origin && isUnsafeMethod(req.method) && path.startsWith('/api/v1')) {
      const requestedWith = req.get('x-requested-with');
      if (requestedWith !== 'XMLHttpRequest') {
        res.status(403).json({ statusCode: 403, message: 'Header CSRF tidak valid', error: 'Forbidden' });
        return;
      }
    }
    next();
  });
  app.enableCors({
    origin: (origin, callback) => callback(null, isTrustedBrowserOrigin(origin, allowedOrigins)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Range', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
  });

  // Reject unknown/invalid fields globally — important for a system where
  // HR-configurable data must not silently accept malformed input.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Papaiz HRIS backend running on http://localhost:${port}/api/v1`);
}
bootstrap();
