const { getChannel, getExchangeName } = require('../../services/rabbitmq.service');

const publishToQueue = async (routingKey, message) => {
    try {
        const channel = getChannel();
        if (!channel) {
            console.error('RabbitMQ channel not available.');
            return false;
        }
        
        // Determine queue name based on routing key
        const queueName = routingKey === 'email' ? 'email_queue' : routingKey === 'push' ? 'push_queue' : null;
        if (!queueName) {
            console.error(`Unknown routing key: ${routingKey}`);
            return false;
        }
        
        // Ensure queue exists
        await channel.assertQueue(queueName, { durable: true });
        
        // NestJS RMQ expects messages with pattern matching the queue name
        // Format: { pattern: 'queue_name', data: message }
        const nestMessage = {
            pattern: queueName,
            data: message
        };
        
        // Ensure message is a Buffer
        const messageBuffer = Buffer.from(JSON.stringify(nestMessage));
        
        // Publish directly to queue
        channel.sendToQueue(queueName, messageBuffer, { persistent: true });
        console.log(`Message published to queue '${queueName}'`);
        return true;
    } catch (error) {
        console.error('Error publishing message to RabbitMQ:', error);
        return false;
    }
};

module.exports = {
    publishToQueue,
};
