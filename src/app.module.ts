import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DisputeModule } from './dispute/dispute.module';
import { EscrowModule } from './escrow/escrow.module';
import { PrismaModule } from './prisma/prisma.module';
import { StellarModule } from './stellar/stellar.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    PrismaModule,
    EscrowModule,
    StellarModule,
    DisputeModule,
    WorkersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
