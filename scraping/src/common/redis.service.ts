import {
	Inject,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(RedisService.name);
	private client: Redis;

	constructor(
		@Inject(redisConfig.KEY)
		private readonly redis: ConfigType<typeof redisConfig>,
	) {}

	async onModuleInit(): Promise<void> {
		const redisOptions: any = {
			host: this.redis.host,
			port: this.redis.port,
			maxRetriesPerRequest: 3,
			lazyConnect: true,
		};

		if (this.redis.password) {
			redisOptions.password = this.redis.password;
		}

		this.client = new Redis(redisOptions);

		this.client.on('connect', () => {
			this.logger.log('Connected to Redis');
		});

		this.client.on('error', (error) => {
			this.logger.error('Redis connection error:', error);
		});

		try {
			await this.client.connect();
		} catch (error) {
			this.logger.error('Failed to connect to Redis:', error);
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (this.client) {
			await this.client.quit();
			this.logger.log('Disconnected from Redis');
		}
	}

	async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
		if (ttlSeconds) {
			await this.client.setex(key, ttlSeconds, value);
		} else {
			await this.client.set(key, value);
		}
	}

	async get(key: string): Promise<string | null> {
		return this.client.get(key);
	}

	async exists(key: string): Promise<boolean> {
		return (await this.client.exists(key)) === 1;
	}

	async acquireLock(
		lockKey: string,
		ttlSeconds = 30,
	): Promise<string | null> {
		const lockValue = `lock:${Date.now()}:${Math.random()}`;
		const acquired = await this.client.set(
			lockKey,
			lockValue,
			'EX',
			ttlSeconds,
			'NX',
		);
		return acquired === 'OK' ? lockValue : null;
	}

	async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
		const script = `
			if redis.call("GET", KEYS[1]) == ARGV[1] then
				return redis.call("DEL", KEYS[1])
			else
				return 0
			end
		`;
		const result = await this.client.eval(script, 1, lockKey, lockValue);
		return result === 1;
	}
}
