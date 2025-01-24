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

  // Files creation logic (omitted for brevity, same as before)
  // ...

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
