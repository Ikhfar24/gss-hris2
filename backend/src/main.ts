import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { isTrustedBrowserOrigin, isUnsafeMethod, trustedOrigins } from './common/security/trusted-origin';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = trustedOrigins(process.env.CORS_ORIGIN);
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

  app.use(helmet({ hsts: isProduction ? undefined : false }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (isUnsafeMethod(req.method) && !isTrustedBrowserOrigin(origin, allowedOrigins)) {
      res.status(403).json({ statusCode: 403, message: 'Origin permintaan tidak diizinkan', error: 'Forbidden' });
      return;
    }
    next();
  });
  app.enableCors({
    origin: (origin, callback) => callback(null, isTrustedBrowserOrigin(origin, allowedOrigins)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Range'],
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

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Papaiz HRIS backend running on http://localhost:${port}/api/v1`);
}
bootstrap();
