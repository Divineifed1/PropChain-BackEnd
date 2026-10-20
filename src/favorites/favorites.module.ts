import { Module } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FavoritesTraceInterceptor } from './interceptors/favorites-trace.interceptor';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FavoritesController],
  providers: [FavoritesService, FavoritesTraceInterceptor],
  exports: [FavoritesService],
})
export class FavoritesModule {}
