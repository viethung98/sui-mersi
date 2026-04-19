import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import serverConfig from './config/server.config';
import { initializeDatabase } from './database/database-initializer.service';

async function bootstrap() {
	await initializeDatabase();

	const app = await NestFactory.create(AppModule);

	const allowedOrigins = process.env.ALLOWED_ORIGINS;
	app.enableCors({
		origin: allowedOrigins ? allowedOrigins.split(',') : '*',
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		credentials: true,
	});

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	app.setGlobalPrefix('api');

	const cfg = app.get(serverConfig.KEY);

	if (!process.env.DEPOSIT_WEBHOOK_SECRET) {
		console.warn(
			'[WARN] DEPOSIT_WEBHOOK_SECRET is not set — downstream deposit webhooks will have an empty secret header',
		);
	}

	await app.listen(cfg.port);

	console.log(`Amazon Shopping Agent running on port ${cfg.port}`);
	console.log(`Environment: ${cfg.nodeEnv}`);
}

bootstrap();
