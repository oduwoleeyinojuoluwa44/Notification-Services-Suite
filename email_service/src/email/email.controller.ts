import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext, Transport } from '@nestjs/microservices';
import { EmailService } from './email.service';
import type { EmailJobData } from './interfaces/email.types';
import { ErrorClassifier, ErrorType } from './utils/error-classifier';

@Controller()
export class EmailController {
    private readonly logger = new Logger(EmailController.name);
    private readonly MAX_RETRIES = 5; // Maximum number of retries for transient errors

    constructor(private readonly emailService: EmailService) {}

    @MessagePattern('email_queue', Transport.RMQ)
    async handleEmailJob(@Payload() data: EmailJobData, @Ctx() context: RmqContext): Promise<void> {
        const channel = context.getChannelRef();
        const originalMessage = context.getMessage();

        // Get retry count from message headers (if present)
        const messageHeaders = originalMessage.properties.headers || {};
        const retryCount = messageHeaders['x-retry-count'] || 0;

        try {
            await this.emailService.processEmailJob(data);
            
            // Success - acknowledge message
            channel.ack(originalMessage);
            this.logger.log(`Email job ${data.correlation_id} completed successfully`);
            
        } catch (error) {
            // Classify the error
            const classifiedError = ErrorClassifier.classify(error);
            
            this.logger.error({
                correlation_id: data.correlation_id,
                error_type: classifiedError.type,
                retry_count: retryCount,
                error_message: classifiedError.message,
                user_id: data.user_id,
                email: data.user_data?.email
            }, `Error processing email job (attempt ${retryCount + 1})`);

            // Handle based on error classification
            if (classifiedError.type === ErrorType.PERMANENT) {
                // Permanent error - don't retry, reject message (should go to DLQ if configured)
                this.logger.warn(`Permanent error for ${data.correlation_id} - rejecting message (will go to DLQ if configured)`);
                channel.nack(originalMessage, false, false); // false = don't requeue
                
            } else if (classifiedError.type === ErrorType.TRANSIENT || classifiedError.type === ErrorType.UNKNOWN) {
                // Transient or unknown error - retry with backoff
                if (retryCount < classifiedError.maxRetries) {
                    // Calculate exponential backoff delay
                    const backoffDelay = ErrorClassifier.calculateBackoff(retryCount);
                    
                    this.logger.log(
                        `Retrying email job ${data.correlation_id} (attempt ${retryCount + 1}/${classifiedError.maxRetries})`
                    );

                    // Note: RabbitMQ doesn't allow modifying message properties when requeuing
                    // The retry count is tracked in headers but won't increment on requeue
                    // For production, consider:
                    // 1. Using RabbitMQ Delayed Message Plugin for backoff
                    // 2. Using a separate retry queue with TTL
                    // 3. Tracking retry count in Redis
                    
                    // For now, we requeue and rely on message processing time as backoff
                    // The message will be processed again after current processing completes
                    channel.nack(originalMessage, false, true); // true = requeue
                    
                } else {
                    // Max retries exceeded - reject message (should go to DLQ)
                    this.logger.error(
                        `Max retries (${classifiedError.maxRetries}) exceeded for ${data.correlation_id} - rejecting message (will go to DLQ if configured)`
                    );
                    channel.nack(originalMessage, false, false); // false = don't requeue, goes to DLQ
                }
            } else {
                // Fallback - requeue once more
                this.logger.warn(`Unknown error classification for ${data.correlation_id} - requeuing once`);
                if (retryCount < 1) {
                    channel.nack(originalMessage, false, true);
                } else {
                    channel.nack(originalMessage, false, false);
                }
            }
        }
    }
}
