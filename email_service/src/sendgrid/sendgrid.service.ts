import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendGridCircuitBreaker } from './sendgrid-circuit-breaker';
const sgMail = require('@sendgrid/mail');

@Injectable()
export class SendgridService implements OnModuleInit {
    private readonly logger = new Logger(SendgridService.name);
    private circuitBreaker: SendGridCircuitBreaker | null = null;

    constructor(private readonly configService: ConfigService) {}

    onModuleInit() {
        const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
        if (apiKey) {
            sgMail.setApiKey(apiKey);
            // Initialize circuit breaker with the actual send function
            this.circuitBreaker = new SendGridCircuitBreaker(this.sendEmailDirect.bind(this));
            this.logger.log('SendGrid service initialized with circuit breaker');
        } else {
            this.logger.warn('SENDGRID_API_KEY not set. Email sending will be disabled.');
        }
    }

    /**
     * Send email with circuit breaker protection
     */
    async sendEmail(msg: any) {
        const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
        if (!apiKey) {
            this.logger.warn('SENDGRID_API_KEY not set. Email sending is disabled. Message would have been sent to:', msg.to);
            this.logger.log('Email content:', JSON.stringify(msg, null, 2));
            // For testing: simulate successful send
            return Promise.resolve([{ statusCode: 200, body: {}, headers: {} }]);
        }

        // Use circuit breaker if available
        if (this.circuitBreaker) {
            try {
                return await this.circuitBreaker.execute(msg);
            } catch (error) {
                // Circuit breaker will handle logging
                throw error;
            }
        }

        // Fallback to direct send if circuit breaker not initialized
        return this.sendEmailDirect(msg);
    }

    /**
     * Direct SendGrid API call (used by circuit breaker)
     */
    private async sendEmailDirect(msg: any): Promise<any> {
        try {
            const response = await sgMail.send(msg);
            this.logger.log(`Email sent successfully to: ${msg.to}`);
            this.logger.debug(`SendGrid response status: ${response[0]?.statusCode}, body:`, JSON.stringify(response[0]?.body));
            return response;
        } catch (error) {
            this.logger.error('Error sending email:', error);
            if (error.response?.body) {
                this.logger.error('SendGrid error details:', error.response.body);
            }
            throw error;
        }
    }

    /**
     * Get circuit breaker stats (for monitoring)
     */
    getCircuitBreakerStats(): any {
        return this.circuitBreaker?.getStats() || null;
    }

    /**
     * Get circuit breaker state (for health checks)
     */
    getCircuitBreakerState(): string {
        return this.circuitBreaker?.getState() || 'not_initialized';
    }
}
