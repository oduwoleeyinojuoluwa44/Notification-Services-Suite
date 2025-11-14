import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { EmailJobData } from './interfaces/email.types';
import { ErrorClassifier } from './utils/error-classifier';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private sendgridFromEmail: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly sendgridService: SendgridService,
    ) {
        this.sendgridFromEmail = this.configService.getOrThrow<string>('SENDGRID_FROM_EMAIL');
    }

    async processEmailJob(jobData: EmailJobData): Promise<boolean> {
        this.logger.log(`Processing email job: ${jobData.correlation_id}`);

        try {
            // Validate notification type
            if (jobData.notification_type !== 'email') {
                this.logger.log(`Skipping non-email notification (type: ${jobData.notification_type}) for correlation_id: ${jobData.correlation_id}`);
                return true;
            }

            // Check user preferences
            if (!jobData.user_data?.preferences?.email) {
                this.logger.log(`User ${jobData.user_id} has disabled email notifications. Skipping...`);
                return true;
            }

            // Validate required data
            if (!jobData.user_data?.email) {
                const error = new Error(`User email not found for user_id: ${jobData.user_id}`);
                this.logger.error(error.message);
                throw error;
            }

            if (!jobData.template_content) {
                const error = new Error(`Template content not provided for template_id: ${jobData.template_id}`);
                this.logger.error(error.message);
                throw error;
            }

            // Substitute variables in template content
            let finalContent = jobData.template_content;
            if (jobData.variables) {
                Object.keys(jobData.variables).forEach(key => {
                    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                    const value = jobData.variables?.[key];
                    if (value !== undefined) {
                        finalContent = finalContent.replace(regex, String(value));
                    }
                });
            }

            // Send email via SendGrid (with circuit breaker protection)
            await this.sendgridService.sendEmail({
                to: jobData.user_data.email,
                from: this.sendgridFromEmail,
                subject: 'Notification',
                html: finalContent,
            });

            this.logger.log(`Email job ${jobData.correlation_id} completed successfully`);
            return true;

        } catch (error) {
            // Classify error for better logging
            const classifiedError = ErrorClassifier.classify(error);
            
            this.logger.error({
                correlation_id: jobData.correlation_id,
                error_type: classifiedError.type,
                error_message: classifiedError.message,
                user_id: jobData.user_id,
                email: jobData.user_data?.email,
                should_retry: classifiedError.shouldRetry,
                max_retries: classifiedError.maxRetries
            }, 'Email job processing failed');

            // Re-throw error so controller can handle retry logic
            throw error;
        }
    }
}
