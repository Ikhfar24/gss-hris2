import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(`Prisma error ${exception.code}: ${exception.message}`, exception.stack);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pemrosesan pada basis data';
    let error = 'Internal Server Error';

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        message = 'Data yang dikirimkan mengalami konflik atau sudah terdaftar';
        error = 'Conflict';
        break;
      }
      case 'P2025': {
        status = HttpStatus.NOT_FOUND;
        message = 'Data yang diminta tidak ditemukan';
        error = 'Not Found';
        break;
      }
      case 'P2003': {
        status = HttpStatus.BAD_REQUEST;
        message = 'Relasi referensi data tidak valid';
        error = 'Bad Request';
        break;
      }
      default: {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Terjadi kesalahan sistem';
        error = 'Internal Server Error';
        break;
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
    });
  }
}
