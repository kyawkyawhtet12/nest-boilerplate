#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Ensuring necessary packages are installed...');
const packages = [
    '@nestjs/jwt',
    '@nestjs/passport',
    'passport',
    'passport-jwt',
    'bcrypt',
    '@nestjs/swagger', // Swagger package
];
execSync(`npm install ${packages.join(' ')} --legacy-peer-deps`, { stdio: 'inherit' });

console.log('Generating Auth resource...');
execSync('npx nest g resource auth --no-spec', { stdio: 'inherit' });

console.log('Configuring authentication logic...');

const authServicePath = path.join(process.cwd(), 'src/auth/auth.service.ts');
const authControllerPath = path.join(process.cwd(), 'src/auth/auth.controller.ts');
const authModulePath = path.join(process.cwd(), 'src/auth/auth.module.ts');
const dtoPath = path.join(process.cwd(), 'src/auth/dto');

// Ensure the DTO directory exists
if (!fs.existsSync(dtoPath)) {
    fs.mkdirSync(dtoPath, { recursive: true });
}

// DTO content for Register
const registerDtoContent = `
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'User name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;
}
`;

// DTO content for Login
const loginDtoContent = `
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  password: string;
}
`;

// AuthService content
const authServiceContent = `
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async register(name: string, email: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { name, email, password: hashedPassword },
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token };
  }
}
`;

// AuthController content with Public decorator
const authControllerContent = `
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResponseMessage } from '../common/decorators/response/response-message.decorator';
import { Public } from 'src/common/decorators/auth/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ResponseMessage('User registered successfully')
  async register(@Body() registerDto: RegisterDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.authService.register(
      registerDto.name,
      registerDto.email,
      registerDto.password,
    );
  }

  @Post('login')
  @Public()
  @ResponseMessage('User logged in successfully')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }
}
`;

// AuthModule content (Including APP_GUARD and JwtModule)
const authModuleContent = `
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../common/guards/auth.guard';
import { jwtConstants } from '../common/guards/jwt.constants';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AuthModule {}
`;

// Write the files
fs.writeFileSync(path.join(dtoPath, 'register.dto.ts'), registerDtoContent.trim());
fs.writeFileSync(path.join(dtoPath, 'login.dto.ts'), loginDtoContent.trim());
fs.writeFileSync(authServicePath, authServiceContent.trim());
fs.writeFileSync(authControllerPath, authControllerContent.trim());
fs.writeFileSync(authModulePath, authModuleContent.trim());

console.log('Authentication setup complete.');
