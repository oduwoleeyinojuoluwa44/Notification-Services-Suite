// api_gateway/services/rabbitmq.service.js
const { initRabbitMQ, publishMessage } = require('../src/utils/publisher');
const config = require('../config/config');
const { logger } = require('../middlewares/logger.middleware');

let rabbitmqChannel = null;

async function initializeRabbitMQ() {
    if (rabbitmqChannel) {
        return;
    }
    // Only connect to RabbitMQ if not in test environment
    if (process.env.NODE_ENV !== 'test') {
        const rabbitMQConnection = await initRabbitMQ(config.RABBITMQ_URL);
        if (rabbitMQConnection) {
            rabbitmqChannel = rabbitMQConnection.channel;
        } else {
            logger.error('Failed to initialize RabbitMQ connection. Publisher will not function.');
        }
    } else {
        logger.info('Skipping RabbitMQ connection in test environment.');
    }
}

async function sendToQueue(queueName, message) {
    if (!rabbitmqChannel && process.env.NODE_ENV !== 'test') {
        logger.error('RabbitMQ channel not initialized. Attempting to re-initialize...');
        await initializeRabbitMQ();
        if (!rabbitmqChannel) {
            throw new Error('RabbitMQ channel could not be initialized.');
        }
    }

    if (process.env.NODE_ENV === 'test') {
        logger.info(`MOCK: Message sent to queue ${queueName}: ${JSON.stringify(message)}`);
        return true; // Simulate success in test environment
    }

    try {
        // Ensure the queue exists before publishing
        await rabbitmqChannel.assertQueue(queueName, { durable: true });
        const sent = publishMessage(rabbitmqChannel, 'notifications.direct', queueName, message);
        if (!sent) {
            logger.error({ queueName, message: message.correlation_id }, 'Message not sent to queue (buffer full)');
            throw new Error('RabbitMQ buffer full, message not sent.');
        }
    } catch (error) {
        logger.error({ error, queueName, message }, 'Failed to send message to RabbitMQ queue');
        throw error;
    }
}

// Initialize RabbitMQ connection when the service starts
initializeRabbitMQ().catch(err => {
    logger.error({ err }, 'Initial RabbitMQ connection failed outside of request context.');
});

module.exports = {
    sendToQueue,
};
