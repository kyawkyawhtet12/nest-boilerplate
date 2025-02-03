#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Helper function to prompt the user for input
const promptUser = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
};

const main = async () => {
  console.log('Starting NestJS project setup...');

  // Step 1: Ask user for NestJS version
  const versionInput = await promptUser(
    'Enter the NestJS version you are using (e.g., 10.4.9 or "latest"): '
  );
  const nestVersion = versionInput.toLowerCase() === 'latest' ? 'latest' : versionInput;

  console.log(`Configuring packages for NestJS version: ${nestVersion}`);

  // Step 2: Define package versions based on user input
  const packages = [
    '@nestjs/jwt',
    `@nestjs/core${nestVersion === 'latest' ? '' : `@${nestVersion}`}`,
    `@nestjs/common${nestVersion === 'latest' ? '' : `@${nestVersion}`}`,
    '@prisma/client',
    'prisma', // Dev dependency
    'class-validator',
    'class-transformer',
    `@nestjs/swagger${nestVersion === 'latest' ? '' : `@${nestVersion}`}`,
    'swagger-ui-express',
  ];

  // Step 3: Install Required Packages
  console.log('Installing necessary packages...');
  execSync(`npm install ${packages.join(' ')} --legacy-peer-deps`, { stdio: 'inherit' });
  console.log('Packages installed.');

  // Step 4: Run `prisma init`
  console.log('Initializing Prisma...');
  execSync('npx prisma init', { stdio: 'inherit' });

  // Step 5: Create Directories and Add Files
  const basePath = path.join(process.cwd(), 'src');
  const paths = {
    guards: path.join(basePath, 'common', 'guards'),
    interceptors: path.join(basePath, 'common', 'interceptors'),
    decoratorsAuth: path.join(basePath, 'common', 'decorators', 'auth'),
    decoratorsResponse: path.join(basePath, 'common', 'decorators', 'response'),
    prisma: path.join(basePath, 'prisma'),
  };

  Object.values(paths).forEach((dir) => fs.ensureDirSync(dir));
  console.log('Creating and configuring files...');

  console.log('Creating and configuring files...');

  // AuthGuard
  fs.writeFileSync(
    path.join(paths.guards, 'auth.guard.ts'),
    `
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from './jwt.constants';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/auth/public.decorator';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
`
  );
  // Constants
  fs.writeFileSync(
    path.join(paths.guards, 'jwt.constants.ts'),
    `
export const jwtConstants = {
  secret: 'PLEASE CHANGE THIS TO YOUR OWN SECRET',
};
`
  );
  // ResponseInterceptor
  fs.writeFileSync(
    path.join(paths.interceptors, 'response.interceptor.ts'),
    `
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RESPONSE_MESSAGE_METADATA } from '../decorators/response/response-message.decorator';
export type Response<T> = {
  status: boolean;
  statusCode: number;
  message: string;
  data: T;
};
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private reflector: Reflector) {}
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((res: unknown) => this.responseHandler(res, context)),
      catchError((err: HttpException) =>
        throwError(() => this.errorHandler(err, context)),
      ),
    );
  }
  errorHandler(exception: HttpException, context: ExecutionContext) {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      status: false,
      statusCode: status,
      path: request.url,
      message: exception.message,
      result: exception,
    });
  }
  responseHandler(res: any, context: ExecutionContext) {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;
    const message =
      this.reflector.get<string>(
        RESPONSE_MESSAGE_METADATA,
        context.getHandler(),
      ) || 'success';
    return {
      status: true,
      message: message,
      statusCode,
      data: res,
    };
  }
}
`
  );
  // Public Decorator
  fs.writeFileSync(
    path.join(paths.decoratorsAuth, 'public.decorator.ts'),
    `
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
`
  );
  // Response Message Decorator
  fs.writeFileSync(
    path.join(paths.decoratorsResponse, 'response-message.decorator.ts'),
    `
import { SetMetadata } from '@nestjs/common';
export const RESPONSE_MESSAGE_METADATA = 'responseMessage';
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_METADATA, message);
`
  );
  // PrismaService
  fs.writeFileSync(
    path.join(paths.prisma, 'prisma.service.ts'),
    `
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
`
  );
  // PrismaModule
  fs.writeFileSync(
    path.join(paths.prisma, 'prisma.module.ts'),
    `
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
`
  );

  // Swagger Setup in src/main.ts
  fs.writeFileSync(
    path.join(basePath, 'main.ts'),
    `
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector); // Inject Reflector here
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.setGlobalPrefix('api/v1');
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('The API description')
    .setVersion('1.0')
    .addTag('API')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`
  );

  console.log('Setup complete! Your NestJS project is ready.');
};

main().catch((err) => {
  console.error('An error occurred:', err);
  process.exit(1);
});
