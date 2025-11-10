// api_gateway/src/utils/publisher.js
const amqp = require('amqplib');
const { logger } = require('../../middlewares/logger.middleware'); // Assuming logger is accessible

const EXCHANGE_NAME = 'notifications.direct';

/**
 * Initializes RabbitMQ connection and channel.
 * @param {string} rabbitUrl - The RabbitMQ connection URL.
 * @returns {Promise<object|null>} An object containing the connection and channel, or null if connection fails.
 */
async function initRabbitMQ(rabbitUrl) {
    try {
        const connection = await amqp.connect(rabbitUrl);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
        logger.info('RabbitMQ publisher connected and exchange asserted.');
        return { connection, channel };
    } catch (error) {
        logger.error({ error, rabbitUrl }, 'Failed to connect to RabbitMQ or assert exchange.');
        return null;
    }
}

/**
 * Publishes a message to a RabbitMQ exchange.
 * @param {object} channel - The RabbitMQ channel.
 * @param {string} exchange - The name of the exchange.
 * @param {string} routingKey - The routing key for the message.
 * @param {object} payload - The message payload (will be JSON stringified).
 * @returns {boolean} True if the message was published, false otherwise.
 */
function publishMessage(channel, exchange, routingKey, payload) {
    if (!channel) {
        logger.error('Cannot publish message: RabbitMQ channel is not initialized.');
        return false;
    }
    try {
        const sent = channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
        if (sent) {
            logger.info({ exchange, routingKey, payload: payload.correlation_id }, 'Message published to RabbitMQ');
        } else {
            logger.warn({ exchange, routingKey, payload: payload.correlation_id }, 'Message not published to RabbitMQ (buffer full)');
        }
        return sent;
    } catch (error) {
        logger.error({ error, exchange, routingKey, payload }, 'Failed to publish message to RabbitMQ');
        return false;
    }
}

module.exports = {
    initRabbitMQ,
    publishMessage,
};
