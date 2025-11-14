const amqp = require('amqplib');
const config = require('../config/config'); // Assuming config.js loads .env variables

let connection = null;
let channel = null;
const EXCHANGE_NAME = 'notifications.direct';

const connectRabbitMQ = async () => {
    try {
        // Use the RABBITMQ_URL from config
        connection = await amqp.connect(config.RABBITMQ_URL);
        channel = await connection.createChannel();
        
        // Assert main exchange
        await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
        
        // Assert Dead Letter Exchange
        const DLX_NAME = 'notifications.dlx';
        await channel.assertExchange(DLX_NAME, 'direct', { durable: true });
        
        // Assert queues with Dead Letter Queue configuration
        await channel.assertQueue('email_queue', {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': DLX_NAME,
                'x-dead-letter-routing-key': 'email.failed'
            }
        });
        
        await channel.assertQueue('push_queue', {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': DLX_NAME,
                'x-dead-letter-routing-key': 'push.failed'
            }
        });
        
        // Assert Dead Letter Queues
        await channel.assertQueue('email_queue.dlq', { durable: true });
        await channel.assertQueue('push_queue.dlq', { durable: true });
        
        // Bind DLQs to DLX
        await channel.bindQueue('email_queue.dlq', DLX_NAME, 'email.failed');
        await channel.bindQueue('push_queue.dlq', DLX_NAME, 'push.failed');
        
        // Bind main queues to exchange
        await channel.bindQueue('email_queue', EXCHANGE_NAME, 'email');
        await channel.bindQueue('push_queue', EXCHANGE_NAME, 'push');
        
        console.log('Connected to RabbitMQ and configured queues with DLQ support.');
        
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
            // Implement reconnection logic here
            if (connection) {
                connection.close();
            }
            setTimeout(connectRabbitMQ, 5000); // Attempt to reconnect after 5 seconds
        });
        connection.on('close', () => {
            console.warn('RabbitMQ connection closed. Reconnecting...');
            setTimeout(connectRabbitMQ, 5000); // Attempt to reconnect after 5 seconds
        });
        
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(connectRabbitMQ, 5000); // Retry connection after 5 seconds
    }
};

const getChannel = () => channel;
const getExchangeName = () => EXCHANGE_NAME;

module.exports = {
    connectRabbitMQ,
    getChannel,
    getExchangeName,
};
