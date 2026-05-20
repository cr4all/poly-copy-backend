import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PerformanceAlert, PerformanceAlertSchema } from './entities/performance-alert.schema';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PerformanceAlert.name, schema: PerformanceAlertSchema }]),
    DashboardModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
