import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SendgridModule } from './sendgrid/sendgrid.module';
import { EmailModule } from './email/email.module';
import { TerminusModule } from '@nestjs/terminus';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TerminusModule,
    SendgridModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [SendgridModule], // Export SendgridModule so AppController can inject SendgridService
})
export class AppModule {}
