import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const sgMail = require('@sendgrid/mail');

@Injectable()
export class SendgridService implements OnModuleInit {
    constructor(private readonly configService: ConfigService) {}

    onModuleInit() {
        const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
        if (apiKey) {
            sgMail.setApiKey(apiKey);
        } else {
            console.warn('SENDGRID_API_KEY not set. Email sending will be disabled.');
        }
    }

    async sendEmail(msg: any) {
        const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
        if (!apiKey) {
            console.warn('SENDGRID_API_KEY not set. Email sending is disabled. Message would have been sent to:', msg.to);
            console.log('Email content:', JSON.stringify(msg, null, 2));
            // For testing: simulate successful send
            return Promise.resolve([{ statusCode: 200, body: {}, headers: {} }]);
        }
        try {
            const response = await sgMail.send(msg);
            console.log(`Email sent successfully to: ${msg.to}`);
            console.log(`SendGrid response status: ${response[0]?.statusCode}, body:`, JSON.stringify(response[0]?.body));
            return response;
        } catch (error) {
            console.error('Error sending email:', error);
            console.error('SendGrid error details:', error.response?.body);
            throw error;
        }
    }
}
