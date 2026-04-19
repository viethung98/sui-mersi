import { Module } from '@nestjs/common';
import { NormalizationModule } from '../normalization/normalization.module';
import { ApifyClientService } from './apify-client.service';
import { RealtimeSearchController } from './realtime-search.controller';
import { RealtimeSearchService } from './realtime-search.service';

@Module({
	imports: [NormalizationModule],
	providers: [
		ApifyClientService,
		RealtimeSearchService,
	],
	controllers: [RealtimeSearchController],
	exports: [RealtimeSearchService, ApifyClientService],
})
export class RealtimeSearchModule {}
