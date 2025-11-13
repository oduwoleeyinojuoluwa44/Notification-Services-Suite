import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext, Transport } from '@nestjs/microservices';
import { EmailService } from './email.service';
import type { EmailJobData } from './interfaces/email.types';

@Controller()
export class EmailController {
    private readonly logger = new Logger(EmailController.name);

    constructor(private readonly emailService: EmailService) {}

    @MessagePattern('email_queue', Transport.RMQ)
    async handleEmailJob(@Payload() data: EmailJobData, @Ctx() context: RmqContext): Promise<void> {
        const channel = context.getChannelRef();
        const originalMessage = context.getMessage();

        try {
            await this.emailService.processEmailJob(data);
            channel.ack(originalMessage);
        } catch (error) {
            this.logger.error(`Error processing email job ${data.correlation_id}:`, error);
            channel.nack(originalMessage, false, true);
        }
    }
}
